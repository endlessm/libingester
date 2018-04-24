// eslint-disable-next-line no-nested-ternary
'use strict';

/** @namespace util */

const cheerio = require('cheerio');
const crypto = require('crypto');
const Feedparser = require('feedparser');
const parseDataUrl = require('parse-data-url');
const request = require('request');
const url = require('url');

const config = require('./config');
const { logger } = require('./logging');
const somaDOM = require('./soma_dom');
const ImageAsset = require('./asset/imageAsset');
const VideoAsset = require('./asset/videoAsset');

const USER_AGENT = 'libingester';

const YOUTUBE_EMBED_DOMAINS = [ 'youtube.com',
                                'www.youtube.com',
                                'www.youtube-nocookie.com' ];

const SAFE_ENCODING_CHARS =
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
    '%';

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
function promisifiedRequest(options) {
    return new Promise((resolve, reject) => {
        pooledRequest(options, (err, res) => {
            if (err) {
                return reject(err);
            }

            return resolve(res);
        });
    });
}

function delayExecution(timeout) {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

function encode_uri(uri) {
    // Node's URL parser normalizes the URL and parses e.g.
    // IDN hostnames into their Punycode representation.
    const parsed = url.format(url.parse(uri));

    // Go through and escape the URI.
    return parsed.split('').map(chr => {
        if (SAFE_ENCODING_CHARS.indexOf(chr) >= 0) {
            return chr;
        }

        // Encode the code-point into UTF-8.
        const buffer = Buffer.from(chr, 'utf8');

        let encodedString = '';
        buffer.forEach(n => {
            encodedString += `%${n.toString(16).toUpperCase()}`;
        });

        return encodedString;
    }).join('');
}

function fetchWithRetry(options, attempt = 1) {
    const maxRetries = parseInt(config.get_setting('max-retries'), 10);
    const retryBackoffDelay = parseInt(config.get_setting('retry-backoff-delay'), 10);

    return promisifiedRequest(options).catch(err => {
        if (attempt > maxRetries) {
            logger.warn(`Max retries (${maxRetries}) exceeded!`);
            throw err;
        }

        if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
            const timeout = Math.pow(2, attempt) * retryBackoffDelay;
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


/**
 * @param {string} uri - URI to load
 * @param {string} [encoding] - A text encoding, overriding the one specified
 *   by @uri
 * @returns {Promise<Cheerio>} - a DOM object constructed from the HTML at @uri
 * @memberof util
 */
function fetch_html(uri, encoding) {
    const encodedUri = encode_uri(uri);

    const options = {
        uri: encodedUri,
        gzip: true,
        encoding,
    };

    logger.debug(`fetching HTML ${encodedUri}`);
    return fetchWithRetry(options).then(({ body }) => cheerio.load(body));
}

/**
 * @param {Cheerio} doc - DOM tree of an HTML document
 * @param {string} base_uri - Fallback base URI, should be the document's URI
 * @returns {string} - Base URI specified by the document if there is one,
 *   otherwise `base_uri`
 * @memberof util
 */
function get_doc_base_uri(doc, baseUri) {
    const $ = cheerio(doc);
    const $base = $.find('base[href]');
    if ($base.length) {
        return $base.attr('href');
    }

    return baseUri;
}

/**
 * @param {Cheerio} video_tag - DOM element to replace with a placeholder for
 *   the video to be downloaded later
 * @param {string} video_uri - URI from which to download the video
 * @returns {VideoAsset}
 * @memberof util
 */
function get_embedded_video_asset(videoTag, videoUri) {
    const asset = new VideoAsset();
    asset.set_download_uri(videoUri);
    asset.set_last_modified_date(new Date());

    // All video elements should be replaced with a link. An img tag with src
    // will be populated by db-build after the thumbnail is ingested, and the
    // link href will be filled out during the article's crosslinking process
    // at pack time.
    const placeholder = cheerio('<a></a>');
    placeholder.attr('data-soma-widget', 'VideoLink');
    placeholder.attr('data-libingester-asset-id', asset.asset_id);
    placeholder.addClass('media-link video');
    videoTag.replaceWith(placeholder);

    return asset;
}

function getSha256(buffer) {
    return crypto.createHash('sha256')
                 .update(buffer)
                 .digest('hex');
}

function getImageSource($img, baseUri) {
    const src = $img.attr('src');
    if (src) {
        return url.resolve(baseUri, src);
    }

    const srcSet = $img.attr('srcset');
    if (srcSet) {
        const firstDecl = srcSet.split(',')[0];
        const firstUri = firstDecl.split(/\s+/)[0];
        return url.resolve(baseUri, firstUri);
    }

    const dataSrc = $img.attr('data-src');
    if (dataSrc) {
        return url.resolve(baseUri, dataSrc);
    }

    throw new Error('Could not parse img tag\'s src');
}

/**
 * @param {string} uri - URI of an image
 * @returns {ImageAsset}
 * @memberof util
 */
function download_image(uri) {
    const encodedUri = encode_uri(uri);

    const asset = new ImageAsset();
    asset.set_canonical_uri(encodedUri);
    asset.set_last_modified_date(new Date());

    const fetchPromise = fetchWithRetry({
        uri: encodedUri,
        encoding: null,
    }).then(response => {
        if (response.statusCode >= 300) {
            throw new Error(`Request for image ${encodedUri} a non-successful ` +
                            `status code ${response.statusCode}`);
        }

        const contentType = response.headers['content-type'];
        if (contentType.match(/^image/i) === null) {
            throw new Error(`Request for image ${encodedUri} resulted in a ` +
                            `non-image: ${contentType}`);
        }

        asset.set_image_data(contentType, response.body);
    });

    // eslint-disable-next-line no-undefined
    asset.set_image_data(undefined, fetchPromise);
    return asset;
}

/**
 * Downloads a thumbnail image for the Youtube video specified by `$embed_url`.
 *
 * @param {string} embed_url - Youtube embed video URL
 * @returns {ImageAsset}
 * @memberof util
 */
function download_youtube_thumbnail(embedUrl) {
    const parsed = url.parse(embedUrl);
    const isYoutube = YOUTUBE_EMBED_DOMAINS.includes(parsed.hostname);
    if (isYoutube && parsed.pathname.includes('/embed/')) {
        const thumb = '/0.jpg';
        const path = parsed.pathname.replace('/embed/', '') + thumb;
        const baseUrlImg = 'http://img.youtube.com/vi/';
        const imgUrl = url.resolve(baseUrlImg, path);

        return download_image(imgUrl);
    }

    return null;
}

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
function download_img($img, baseUri = '') {
    if (typeof $img === 'string') {
        throw new Error('download_img requires a Cheerio object, ' +
                        `but was given "${$img}"`);
    }

    // If we were handed a DOM object that doesn't have the attr function,
    // assume it's a "node" object; this can be converted to a Cheerio object
    // w/ the cheerio constructor
    if (typeof $img.attr === 'undefined') {
        // eslint-disable-next-line no-param-reassign
        $img = cheerio($img);
    }

    if ($img.attr('data-libingester-asset-id')) {
        throw new Error('img already has associated ImageAsset');
    }

    // Handle special case of data URLs as src attribute
    const parsedData = parseDataUrl($img.attr('src'));
    if (parsedData) {
        const mediaType = parsedData.mediaType;
        const binaryData = Buffer.from(parsedData.data, 'base64');
        const contentHash = getSha256(binaryData);
        const canonicalUri = `data:${mediaType};uri=${baseUri};sha256=${contentHash};`;

        const asset = new ImageAsset();
        asset.set_last_modified_date(new Date());
        asset.set_canonical_uri(encode_uri(canonicalUri));
        asset.set_image_data(mediaType, binaryData);

        return asset;
    }

    const src = getImageSource($img, baseUri);

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

/**
 * Get parsed settings to limit the ingested items.
 *
 * The `maxItems` and `maxDaysOld` parameters can be overridden by the
 * `LIBINGESTER_MAX_ITEMS` and `LIBINGESTER_MAX_DAYS_OLD` environment
 * variables, respectively.
 *
 * @param {number} [desiredMaxItems=Infinity] - Maximum number of entries to ingest
 * @param {number} [desiredMaxDaysOld=1] - Maximum age of entries to ingest, in days
 * @returns {Object} - Object with parsed settings `max_items` and `oldest_date`
 * @memberof util
 */
function get_ingestion_limits(desiredMaxItems = Infinity, desiredMaxDaysOld = 1) {
    const actualMaxDaysOld = process.env.LIBINGESTER_MAX_DAYS_OLD || desiredMaxDaysOld;
    const oldestDate = new Date();
    oldestDate.setDate(oldestDate.getDate() - parseInt(actualMaxDaysOld, 10));

    let actualMaxItems = process.env.LIBINGESTER_MAX_ITEMS || desiredMaxItems;
    if (actualMaxItems !== Infinity) {
        actualMaxItems = parseInt(actualMaxItems, 10);
    }

    return {
        max_items: actualMaxItems,
        oldest_date: oldestDate,
    };
}

function _fetchRssPage(feed, page, items, allLinks, maxItems, oldestDate) {
    let isPaginated = false;
    let feedUrl;

    let feedObj = feed;
    if (Array.isArray(feed)) {
        feedObj = feed[0];
    }

    if (typeof feedObj === 'function') {
        isPaginated = true;
        feedUrl = feedObj(page);
    } else {
        feedUrl = feedObj;
    }

    if (!feedUrl) {
        return items;
    }

    logger.debug(`Fetching RSS ${feedUrl}`);

    return _fetchRssJsonWithRetry(feedUrl).then(feedJson => {
        const recentEnoughItems = feedJson.items
              .filter(item => item.pubdate >= oldestDate);

        const limitedItems = [];
        recentEnoughItems.slice(0, maxItems - items.length).forEach(item => {
            if (!allLinks.has(item.link)) {
                limitedItems.push(item);
                allLinks.add(item.link);
            }
        });

        const newItems = items.concat(limitedItems);

        // If we've run into articles which are too old, or we've hit the max
        // number of items, cease crawling
        const doneCrawling = feedJson.items.length === 0 ||
                             limitedItems.length < feedJson.items.length;

        if (typeof feedObj !== 'function' && _isWordpressFeed(feedJson)) {
            logger.debug('Wordpress feed found, adding pagination');
            isPaginated = true;
            const newFeed = _doCreateWordpress(feedObj);
            if (Array.isArray(feed)) {
                feed.shift();
                // eslint-disable-next-line no-param-reassign
                feed = [newFeed].concat(feed);
            } else {
                // eslint-disable-next-line no-param-reassign
                feed = newFeed;
            }
        }

        // eslint-disable-next-line no-extra-parens
        const _continue = Array.isArray(feed) || (!doneCrawling && isPaginated);

        if (!_continue) {
            return newItems;
        }

        let newPage;
        if (doneCrawling && isPaginated && Array.isArray(feed)) {
            feed.shift();
            newPage = 1;
        } else if (isPaginated) {
            newPage = page + 1;
        } else if (Array.isArray(feed)) {
            feed.shift();
            newPage = 1;
        }
        return _fetchRssPage(feed, newPage, newItems, allLinks, maxItems, oldestDate);
    });
}

/**
 * A utility for fetching entries from an RSS feed for further processing.
 *
 * The `max_items` and `max_days_old` parameters can be overridden by the
 * `LIBINGESTER_MAX_ITEMS` and `LIBINGESTER_MAX_DAYS_OLD` environment
 * variables, respectively.
 *
 * @param {string|Array|Function} feed - URL of RSS feed to read, or an array of
 *   URLs of RSS feeds to read, or a paginator function that returns a URL given
 *   a page number
 * @param {number} [max_items=Infinity] - Maximum number of entries to return
 * @param {number} [max_days_old=1] - Maximum age of entries returned, in days
 * @returns {Promise<Object[]>} - Array of RSS feed entries
 * @memberof util
 */
function fetch_rss_entries(feed, max_items = Infinity, max_days_old = 1) {
    // Allow environment variables to override this
    const limits = get_ingestion_limits(max_items, max_days_old);

    return _fetchRssPage(feed, 1, [], new Set(), limits.max_items,
                         limits.oldest_date);
}

function _fetchRssJson(feedUrl) {
    return new Promise((resolve, reject) => {
        const req = request.get(feedUrl);
        const parser = new Feedparser();

        req.on('error', reject);
        parser.on('error', reject);

        const feedData = { items: [] };

        parser.on('meta', meta => {
            feedData.meta = meta;
        });

        parser.on('data', article => {
            feedData.items.push(article);
        });

        parser.on('end', () => resolve(feedData));

        req.pipe(parser);
    });
}

function _isWordpressFeed(feedJson) {
    const hasGenerator = feedJson.meta.generator &&
          feedJson.meta.generator.startsWith('https://wordpress.org/');
    const hasXmlns = feedJson.meta['rss:site'] &&
          feedJson.meta['rss:site']['@'] &&
          feedJson.meta['rss:site']['@'].xmlns &&
          feedJson.meta['rss:site']['@'].xmlns.startsWith('com-wordpress');

    return hasGenerator || hasXmlns;
}

function _fetchRssJsonWithRetry(feedUrl, attempt = 1) {
    const maxRetries = parseInt(config.get_setting('max-retries'), 10);
    const retryBackoffDelay = parseInt(config.get_setting('retry-backoff-delay'), 10);

    return _fetchRssJson(feedUrl).catch(err => {
        if (attempt > maxRetries) {
            logger.warn(`Max retries (${maxRetries}) exceeded!`);
            throw err;
        }

        const shouldRetry = err.message.match('Unexpected end') ||
                            err.message.match('Not a feed');
        if (shouldRetry) {
            const timeout = Math.pow(2, attempt) * retryBackoffDelay;
            logger.debug(`Delaying execution of ${feedUrl} by ${timeout}`);

            return delayExecution(timeout).then(() => {
                return _fetchRssJsonWithRetry(feedUrl, attempt + 1);
            });
        }

        // We reach here if unexpected error
        throw err;
    });
}

function _doCreateWordpress(feed) {
    return function (pageNum) {
        return `${feed}?paged=${pageNum}`;
    };
}

/**
 * A utility to create a pagination function for Wordpress-generated feeds,
 * since they are so common. Make sure to verify that your feed is generated by
 * Wordpress before using this!
 * @param {string|Array} feed - The URL of the RSS feed (first page), or an
 *   array of URLs of RSS feeds
 * @returns {function} - A paginator function that can be passed to
 *   {@link util.fetch_rss_entries|util.fetch_rss_entries}
 * @memberof util
 */
function create_wordpress_paginator(feed) {
    if (Array.isArray(feed)) {
        return feed.map(uri => _doCreateWordpress(uri));
    }
    return _doCreateWordpress(feed);
}

module.exports = {
    create_wordpress_paginator,
    download_image,
    download_img,
    download_youtube_thumbnail,
    encode_uri,
    fetch_html,
    fetch_rss_entries,
    get_doc_base_uri,
    get_embedded_video_asset,
    get_ingestion_limits,
    set_user_agent,
};
