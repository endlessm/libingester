'use strict';

/** @namespace util */

const cheerio = require('cheerio');
const crypto = require('crypto');
const libingester = require('./index');
const parseDataUrl = require('parse-data-url');
const request = require('request');
const somaDOM = require('./soma_dom');
const url = require('url');
const {logger} = require('./logging');
const config = require('./config');

const USER_AGENT = 'libingester';

const YOUTUBE_EMBED_DOMAINS = ['youtube.com', 'www.youtube.com',
                               'www.youtube-nocookie.com'];

const requestDefaults = {
    headers: {
        'User-Agent': USER_AGENT,
    },
    pool: {
        maxSockets: 10,
    },
};

let pooledRequest = request.defaults(requestDefaults);


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
    const max_retries = parseInt(config.get_setting('max-retries'));
    const retry_backoff_delay = parseInt(config.get_setting('retry-backoff-delay'));
    return promisifiedRequest(options).catch(err => {
        if (attempt > max_retries) {
            logger.warn(`Max retries (${max_retries}) exceeded!`);
            throw err;
        }

        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
            const timeout = Math.pow(2, attempt) * retry_backoff_delay;
            logger.debug(`Delaying execution of ${options.uri} by ${timeout}`);
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

/**
 * @param {string} uri - URI to load
 * @param {string} [encoding] - A text encoding, overriding the one specified
 *   by @uri
 * @returns {Promise<Cheerio>} - a DOM object constructed from the HTML at @uri
 * @memberof util
 */
function fetch_html(uri, encoding) {
    uri = encode_uri(uri);

    const options = {
        uri: uri,
        gzip: true,
        encoding,
    };

    logger.debug(`fetching HTML ${uri}`);
    return fetchWithRetry(options).then(({body}) => cheerio.load(body));
}

exports.fetch_html = fetch_html;

/**
 * @param {Cheerio} doc - DOM tree of an HTML document
 * @param {string} base_uri - Fallback base URI, should be the document's URI
 * @returns {string} - Base URI specified by the document if there is one,
 *   otherwise `base_uri`
 * @memberof util
 */
function get_doc_base_uri(doc, base_uri) {
    const $ = cheerio(doc);
    const $base = $.find('base[href]');
    if ($base.length)
        return $base.attr('href');

    return base_uri;
}

exports.get_doc_base_uri = get_doc_base_uri;

/**
 * @param {Cheerio} video_tag - DOM element to replace with a placeholder for
 *   the video to be downloaded later
 * @param {string} video_uri - URI from which to download the video
 * @returns {VideoAsset}
 * @memberof util
 */
function get_embedded_video_asset(video_tag, video_uri) {
    const asset = new libingester.VideoAsset();
    asset.set_download_uri(video_uri);
    asset.set_last_modified_date(new Date());

    // All video elements should be replaced with a link. An img tag with src
    // will be populated by db-build after the thumbnail is ingested, and the
    // link href will be filled out during the article's crosslinking process
    // at pack time.
    const placeholder = cheerio('<a></a>');
    placeholder.attr('data-soma-widget', 'VideoLink');
    placeholder.attr('data-libingester-asset-id', asset.asset_id);
    placeholder.addClass('media-link video');
    video_tag.replaceWith(placeholder);

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

/**
 * @param {string} uri - URI of an image
 * @returns {ImageAsset}
 * @memberof util
 */
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

/**
 * Downloads a thumbnail image for the Youtube video specified by `$embed_url`.
 *
 * @param {string} embed_url - Youtube embed video URL
 * @returns {ImageAsset}
 * @memberof util
 */
function download_youtube_thumbnail (embed_url) {
    const parsed = url.parse(embed_url);
    const is_youtube = YOUTUBE_EMBED_DOMAINS.includes(parsed.hostname);
    if (is_youtube && parsed.pathname.includes('/embed/')) {
        const thumb = '/0.jpg';
        const path = parsed.pathname.replace('/embed/','') + thumb;
        const base_url_img = 'http://img.youtube.com/vi/';
        const img_url = url.resolve(base_url_img, path);
        return download_image(img_url);
    }

    return null;
}

exports.download_youtube_thumbnail = download_youtube_thumbnail;

/**
 * Downloads an image specified by the `src` attribute of an `<img>` element
 * represented by `$img`. It modifies the `<img>` element to associate it with
 * the image asset, which will be used later on in the ingestion process.
 *
 * This is a convenience function which saves you from having to extract the
 * image URI yourself and pass it to {@link download_image}.
 *
 * Pass `base_uri` to handle relative links in the `src` attribute.
 *
 * @param {Cheerio} $img - DOM tree of an `<img>` element
 * @param {string} base_uri - Base URI of the document
 * @returns {ImageAsset}
 * @memberof util
 */
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

/**
 * Get parsed settings to limit the ingested items.
 *
 * The `max_items` and `max_days_old` parameters can be overridden by the
 * `LIBINGESTER_MAX_ITEMS` and `LIBINGESTER_MAX_DAYS_OLD` environment
 * variables, respectively.
 *
 * @param {number} [max_items=Infinity] - Maximum number of entries to ingest
 * @param {number} [max_days_old=1] - Maximum age of entries to ingest, in days
 * @returns {Object} - An object with parsed settings `max_items` and `oldest_date`
 * @memberof util
 */
function get_ingestion_limits(max_items=Infinity, max_days_old=1) {
    max_days_old = process.env.LIBINGESTER_MAX_DAYS_OLD || max_days_old;

    const oldest_date = new Date();
    oldest_date.setDate(oldest_date.getDate() - parseInt(max_days_old));

    max_items = process.env.LIBINGESTER_MAX_ITEMS || max_items;

    if (isFinite(max_items)) {
        max_items = parseInt(max_items);
    }

    return {max_items: max_items, oldest_date: oldest_date};
}

exports.get_ingestion_limits = get_ingestion_limits;

const rss = require('./util/rss');
exports.rss = rss;
exports.fetch_rss_entries = rss.fetch_rss_entries;
exports.create_wordpress_paginator = rss.create_wordpress_paginator;
