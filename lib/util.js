'use strict';

const cheerio = require('cheerio');
const crypto = require('crypto');
const feedparser = require('feedparser');
const libingester = require('./index');
const moment = require('moment');
const parseDataUrl = require('parse-data-url');
const request = require('request');
const somaDOM = require('./soma_dom');
const url = require('url');
const iconv = require('iconv-lite');

const USER_AGENT = 'libingester';

const requestDefaults = {
    headers: {
        'User-Agent': USER_AGENT,
    },
    pool: {
        maxSockets: 10,
    },
};

let pooledRequest = request.defaults(requestDefaults);

// Exponential wait: 800ms, 1600ms, 3200ms
const MAX_RETRIES = 3;
const RETRY_BACKOFF_DELAY = 800;

// Wrap request results in a promise
function promisifiedRequest (options) {
    return new Promise((resolve, reject) => {
        pooledRequest(options, (err, res, body) => {
            if (err) {
               return reject(err);
            }

            resolve(res);
        });
    });
}

function delayExecution (timeout) {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

function fetchWithRetry (options, attempt = 1) {
    return promisifiedRequest(options).catch(err => {
        if (attempt > MAX_RETRIES) {
            console.warn(`WARN: Max retries (${MAX_RETRIES}) exceeded!`);
            throw err;
        }

        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
            const timeout = Math.pow(2, attempt) * RETRY_BACKOFF_DELAY;
            console.warn(`Delaying execution of ${options.uri} by ${timeout}`);
            return delayExecution(timeout).then(() => {
                return fetchWithRetry(options, attempt + 1);
            });
        }

        // We reach here if unexpected error
        throw err;
    });
}

function set_user_agent(userAgent) {
    const newDefaults = Object.freeze(requestDefaults);
    newDefaults.headers['User-Agent'] = userAgent;
    pooledRequest = request.defaults(newDefaults);
}

exports.set_user_agent = set_user_agent;

function fetch_html(uri, encoding) {
    uri = encode_uri(uri);

    const options = {
        uri: uri,
        gzip: true,
    };

    return fetchWithRetry(options).then(res => {
        let body = res.body;

        // Note that we only support the encoding types provided by iconv-lite:
        // https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings
        if (encoding)
            body = iconv.encode(iconv.decode(body, encoding), 'UTF-8');

        return cheerio.load(body);
    });
}

exports.fetch_html = fetch_html;

function get_doc_base_uri(doc, base_uri) {
    const $ = cheerio(doc);
    const $base = $.find('base[href]');
    if ($base.length)
        return $base.attr('href');

    return base_uri;
}

exports.get_doc_base_uri = get_doc_base_uri;

function get_embedded_video_asset(video_tag, video_uri) {
    const asset = new libingester.VideoAsset();
    asset.set_download_uri(video_uri);
    asset.set_last_modified_date(new Date());

    // All video elements should be replaced with a link. An img tag with src
    // will be populated by db-build after the thumbnail is ingested, and the
    // link href will be filled out during the article's crosslinking process
    // at pack time.
    let videoAttrs = `data-soma-widget="VideoLink"`;
    videoAttrs += ` data-libingester-asset-id="${asset.asset_id}"`;
    videoAttrs += ` class="media-link video"`;
    video_tag.replaceWith(`<a ${videoAttrs}></a>`);

    return asset;
}

exports.get_embedded_video_asset = get_embedded_video_asset;

function get_sha256(buffer) {
    return crypto.createHash('sha256')
                 .update(buffer)
                 .digest('hex');
}

function get_img_src($img, base_uri) {
    const src = $img.attr('src');
    if (src)
        return url.resolve(base_uri, src);

    const srcset = $img.attr('srcset');
    if (srcset) {
        const first_decl = srcset.split(',')[0];
        const first_uri = first_decl.split(/\s+/)[0];
        return url.resolve(base_uri, first_uri);
    }

    const data_src = $img.attr('data-src');
    if (data_src)
        return url.resolve(base_uri, data_src);

    throw new Error("Could not parse img tag's src");
}

function download_image(uri) {
    uri = encode_uri(uri);

    const asset = new libingester.ImageAsset();
    asset.set_canonical_uri(uri);
    asset.set_last_modified_date(new Date());

    const fetchPromise = fetchWithRetry({
        uri: uri,
        encoding: null,
    }).then((response) => {
        if (response.statusCode >= 300) {
            throw new Error(`Request for image ${uri} a non-successful status code ${response.statusCode}`);
        }

        const content_type = response.headers['content-type'];
        if (content_type.match(/^image/i) === null) {
            throw new Error(`Request for image ${uri} resulted in a non-image: ${content_type}`);
        }

        asset.set_image_data(content_type, response.body);
    });

    asset.set_image_data(undefined, fetchPromise);
    return asset;
}

exports.download_image = download_image;

function download_img($img, base_uri) {
    if (typeof $img === 'string')
        throw new Error(`download_img requires a Cheerio object, but was given "${$img}"`);

    if (!base_uri) {
        base_uri = '';
    }

    // If we were handed a DOM object that doesn't have the attr function,
    // assume it's a "node" object; this can be converted to a Cheerio object
    // w/ the cheerio constructor
    if (typeof $img.attr === 'undefined')
        $img = cheerio($img);

    if ($img.attr('data-libingester-asset-id'))
        throw new Error("img already has associated ImageAsset");

    // Handle special case of data URLs as src attribute
    const parsedData = parseDataUrl($img.attr('src'));
    if (parsedData) {
        const mediaType = parsedData.mediaType;
        const binaryData = Buffer.from(parsedData.data, 'base64');
        const contentHash = get_sha256(binaryData);
        const canonicalUri = `data:${mediaType};uri=${base_uri};sha256=${contentHash};`;

        const asset = new libingester.ImageAsset();
        asset.set_last_modified_date(new Date());
        asset.set_canonical_uri(encode_uri(canonicalUri));
        asset.set_image_data(mediaType, binaryData);

        return asset;
    }

    const src = get_img_src($img, base_uri);

    // Knock these out.
    $img.attr('src', null);
    $img.attr('srcset', null);

    const asset = download_image(src);
    $img.attr('data-libingester-asset-id', asset.asset_id);
    $img.attr(somaDOM.Hint.Tag, somaDOM.Hint.ImportantImage);

    const linkWrapper = cheerio(`<a ${somaDOM.Widget.Tag}="${somaDOM.Widget.ImageLink}"></a>`);
    linkWrapper.append($img.clone());
    $img.replaceWith(linkWrapper);

    return asset;
}

exports.download_img = download_img;

function encode_uri(uri) {
    const SAFE_CHARS = (
        // RFC 3986 gen-delims
        ':/?#[]@' +
        // RFC 3986 sub-delims
        '!$&\'()*+,;=' +
        // RFC 3986 section 2.3 Unreserved
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
        'abcdefghijklmnopqrstuvwxyz' +
        '0123456789' +
        '_.-' +
        // non-standard: don't re-percent-encode characters.
        '%'
    );

    // Node's URL parser normalizes the URL and parses e.g.
    // IDN hostnames into their Punycode representation.
    const parsed = url.format(url.parse(uri));

    // Go through and escape the URI.
    return parsed.split('').map((c) => {
        if (SAFE_CHARS.indexOf(c) >= 0) {
            return c;
        } else {
            // Encode the code-point into UTF-8.
            const buf = Buffer.from(c, 'utf8');
            let pct = '';
            buf.forEach((n) => {
                pct += `%${n.toString(16).toUpperCase()}`;
            });
            return pct;
        }
    }).join('');
}

exports.encode_uri = encode_uri;

function fetch_rss_entries (feed, max_items=Infinity, max_days_old=1) {
    // Allow environment variables to override this
    try {
        if (process.env.LIBINGESTER_MAX_ITEMS) {
            max_items = parseInt(process.env.LIBINGESTER_MAX_ITEMS);
        }
        if (process.env.LIBINGESTER_MAX_DAYS_OLD) {
            max_days_old = parseInt(process.env.LIBINGESTER_MAX_DAYS_OLD);
        }
    } catch (err) {
        throw new Error(`Couldn't parse RSS entry overrides: ${err}`);
    }

    const oldest_date = moment().subtract(max_days_old, 'days');

    return _fetch_rss_page(feed, 1, [], max_items, oldest_date);
}

function _fetch_rss_json (feed_url) {
    return new Promise((resolve, reject) => {
        const req = request.get(feed_url);
        const parser = new feedparser();

        req.on('error', reject);
        parser.on('error', reject);

        const feed_data = { items: [] };
        parser.on('meta', meta => feed_data.meta = meta);
        parser.on('data', article => feed_data.items.push(article));
        parser.on('end', () => resolve(feed_data));

        req.pipe(parser);
    });
}

function _fetch_rss_page (feed, page, items, max_items, oldest_date) {
    let feed_url, is_paginated;
    if (typeof feed === 'function') {
        is_paginated = true;
        feed_url = feed(page);
    } else {
        is_paginated = false;
        feed_url = feed;
    }

    return _fetch_rss_json(feed_url).then(feed_json => {
        const limited_items = feed_json.items.slice(0, max_items - items.length);
        const recent_enough_items = limited_items.filter(article => article.pubdate >= oldest_date);
        const new_items = items.concat(recent_enough_items);

        // If we've run into articles which are too old, or we've hit the max
        // number of items, cease crawling
        const done_crawling = (recent_enough_items.length < feed_json.items.length);

        if (is_paginated && !done_crawling) {
            return _fetch_rss_page(feed, page + 1, new_items, max_items, oldest_date);
        } else {
            return new_items;
        }
    });
}

exports.fetch_rss_entries = fetch_rss_entries;

// Provide a pagination function for wordpress since it's so common. Make sure
// to verify that your feed is generated by wordpress before using this!
exports.create_wordpress_paginator = uri => n => `${uri}?paged=${n}`;
