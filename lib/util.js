'use strict';

/** @namespace util */

const cheerio = require('cheerio');
const crypto = require('crypto');
const Feedparser = require('feedparser');
const parseDataUrl = require('parse-data-url');
const request = require('request');
const url = require('url');
const imageType = require('image-type');

const config = require('./config');
const { logger } = require('./logging');
const somaDOM = require('./soma_dom');
const BlogArticle = require('./asset/blogArticle');
const ImageAsset = require('./asset/imageAsset');
const NewsArticle = require('./asset/newsArticle');
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

        const shouldRetry = err.code === 'ECONNRESET' ||
                            err.code === 'ETIMEDOUT' ||
                            // This is a DNS resolution error, not a
                            // 404:
                            err.code === 'ENOTFOUND';
        if (shouldRetry) {
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


class FetchHtmlError extends Error { }

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
    return fetchWithRetry(options).then(({ body, statusCode, headers }) => {
        if (statusCode >= 300) {
            throw new FetchHtmlError(`Request for page ${encodedUri} got a non-successful ` +
                                     `status code ${statusCode}`);
        }
        const contentType = headers['content-type'];
        if (contentType.match(/^text\/html/i) === null) {
            throw new FetchHtmlError(`Request for page ${encodedUri} got a content type ` +
                                     `different than text/html: ${contentType}`);
        }
        return cheerio.load(body);
    });
}

async function _fetch_article(hatch, uri, encoding, Article) {
    const asset = new Article();
    let $;
    try {
        $ = await fetch_html(uri, encoding);
        asset.set_canonical_uri(uri);
    } catch (error) {
        if (error instanceof FetchHtmlError) {
            logger.error(error);
            hatch.save_failed_asset(asset);
        } else {
            throw error;
        }
    }
    return { $, asset };
}

/**
 * Returns a DOM object and a NewsArticle corresponding to the URI
 * provided.  If fetching the DOM fails, the NewsArticle is marked as
 * failed in the hatch.
 *
 * @param {Hatch} hatch - If the asset fails it will be saved as
 *   failed in this Hatch.
 * @param {string} uri - URI to load
 * @param {string} [encoding] - A text encoding, overriding the one
 *   specified by @uri
 * @returns {Promise<Object>} - a DOM object constructed from the HTML
 *   at @uri, and a {@link NewsArticle}
 * @memberof util
 */
function fetch_news_article(hatch, uri, encoding) {
    return _fetch_article(hatch, uri, encoding, NewsArticle);
}

/**
 * Returns a DOM object and a BlogArticle corresponding to the URI
 * provided.  If fetching the DOM fails, the BlogArticle is marked as
 * failed in the hatch.
 *
 * @param {Hatch} hatch - If the asset fails it will be saved as
 *   failed in this Hatch.
 * @param {string} uri - URI to load
 * @param {string} [encoding] - A text encoding, overriding the one
 *   specified by @uri
 * @returns {Promise<Object>} - a DOM object constructed from the HTML
 *   at @uri, and a {@link BlogArticle}
 * @memberof util
 */
function fetch_blog_article(hatch, uri, encoding) {
    return _fetch_article(hatch, uri, encoding, BlogArticle);
}

/**
 * @param {Cheerio} doc - DOM tree of an HTML document
 * @param {string} baseUri - Fallback base URI, should be the document's URI
 * @returns {string} - Base URI specified by the document if there is one,
 *   otherwise `baseUri`
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
 * @param {Cheerio} videoTag - DOM element to replace with a placeholder for
 *   the video to be downloaded later
 * @param {string} videoUri - URI from which to download the video
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

        let contentType = response.headers['content-type'];
        if (contentType.match(/^image/i) === null) {
            const imageTypeFromContent = imageType(response.body);
            if (imageTypeFromContent) {
                contentType = imageTypeFromContent.mime;
            } else {
                throw new Error(`Request for image ${encodedUri} resulted in a ` +
                                `non-image: ${contentType}`);
            }
        }

        asset.set_image_data(contentType, response.body);
    });

    // eslint-disable-next-line no-undefined
    asset.set_image_data(undefined, fetchPromise);
    return asset;
}

/**
 * Downloads a thumbnail image for the Youtube video specified by `$embedUrl`.
 *
 * @param {string} embedUrl - Youtube embed video URL
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
 * Pass `baseUri` to handle relative links in the `src` attribute.
 *
 * @param {Cheerio} $img - DOM tree of an `<img>` element
 * @param {string} baseUri - Base URI of the document
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

    let asset;

    // Handle special case of data URLs as src attribute
    const parsedData = parseDataUrl($img.attr('src'));
    if (parsedData) {
        const mediaType = parsedData.mediaType;
        const binaryData = Buffer.from(parsedData.data, 'base64');
        const contentHash = getSha256(binaryData);
        const canonicalUri = `data:${mediaType};uri=${baseUri};sha256=${contentHash};`;

        asset = new ImageAsset();
        asset.set_last_modified_date(new Date());
        asset.set_canonical_uri(encode_uri(canonicalUri));
        asset.set_image_data(mediaType, binaryData);
    } else {
        const src = getImageSource($img, baseUri);
        asset = download_image(src);
    }

    // Knock these out.
    $img.attr('src', null);
    $img.attr('srcset', null);

    $img.attr('data-libingester-asset-id', asset.asset_id);
    $img.attr(somaDOM.Hint.Tag, somaDOM.Hint.ImportantImage);

    const linkWrapper = cheerio(`<a ${somaDOM.Widget.Tag}="${somaDOM.Widget.ImageLink}"></a>`);
    $img.wrap(linkWrapper);

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

function _fetchRssPage(feed, page, items, allLinks, maxItems, oldestDate, requestOptions) {
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

    return _fetchRssJsonWithRetry(feedUrl, requestOptions).then(feedJson => {
        const recentEnoughItems = feedJson.items
              .filter(item => item.pubdate >= oldestDate);

        const limitedItems = [];
        recentEnoughItems.slice(0, maxItems - items.length).forEach(item => {
            if (item.link && !allLinks.has(item.link)) {
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
        return _fetchRssPage(feed, newPage, newItems, allLinks, maxItems,
                             oldestDate, requestOptions);
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
 * @param {Object} [request_options={}] - Options to pass to the RSS request
 * @returns {Promise<Object[]>} - Array of RSS feed entries
 * @memberof util
 */
function fetch_rss_entries(feed, max_items = Infinity, max_days_old = 1, request_options = {}) {
    // Allow environment variables to override this
    const limits = get_ingestion_limits(max_items, max_days_old);

    return _fetchRssPage(feed, 1, [], new Set(), limits.max_items,
                         limits.oldest_date, request_options);
}

function _fetchRssJson(feedUrl, requestOptions) {
    return new Promise((resolve, reject) => {
        const reqOptions = requestOptions || {};
        reqOptions.url = feedUrl;
        const req = request.get(reqOptions);
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
          feedJson.meta.generator.match(/wordpress/i);
    const hasXmlns = feedJson.meta['rss:site'] &&
          feedJson.meta['rss:site']['@'] &&
          feedJson.meta['rss:site']['@'].xmlns &&
          feedJson.meta['rss:site']['@'].xmlns.startsWith('com-wordpress');

    return hasGenerator || hasXmlns;
}

function _fetchRssJsonWithRetry(feedUrl, requestOptions, attempt = 1) {
    const maxRetries = parseInt(config.get_setting('max-retries'), 10);
    const retryBackoffDelay = parseInt(config.get_setting('retry-backoff-delay'), 10);

    return _fetchRssJson(feedUrl, requestOptions).catch(err => {
        if (attempt > maxRetries) {
            logger.warn(`Max retries (${maxRetries}) exceeded!`);
            throw err;
        }

        const shouldRetry = err.message.match('Unexpected end') ||
                            err.message.match('Not a feed') ||
                            // This is a DNS resolution error, not a
                            // 404:
                            err.code === 'ENOTFOUND';
        if (shouldRetry) {
            const timeout = Math.pow(2, attempt) * retryBackoffDelay;
            logger.debug(`Delaying execution of ${feedUrl} by ${timeout}`);

            return delayExecution(timeout).then(() => {
                return _fetchRssJsonWithRetry(feedUrl, requestOptions, attempt + 1);
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

// All the HTML tag attributes that can inject a script:
const ONEVENT_ATTRS = [
    'onabort', 'onafterprint', 'onbeforeprint', 'onbeforeunload', 'onblur', 'oncanplay',
    'oncanplaythrough', 'onchange', 'onclick', 'oncontextmenu', 'oncopy', 'oncuechange',
    'oncut', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover',
    'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus',
    'onhashchange', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload',
    'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onmousedown', 'onmousemove', 'onmouseout',
    'onmouseover', 'onmouseup', 'onmousewheel', 'onoffline', 'ononline', 'onpagehide', 'onpageshow',
    'onpaste', 'onpause', 'onplay', 'onplaying', 'onpopstate', 'onprogress', 'onratechange', 'onreset',
    'onresize', 'onscroll', 'onsearch', 'onseeked', 'onseeking', 'onselect', 'onstalled', 'onstorage',
    'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'onunload', 'onvolumechange', 'onwaiting', 'onwheel',
];

/**
 * Default options for {@link utilcleanup_body}
 *
 * @property {Array} remove
 * @property {Array} removeNoText
 * @property {Array} removeData
 * @property {Object.<string, Array>} removeAttrs
 * @property {boolean} noComments
 * @memberof util
 */
const CLEANUP_DEFAULTS = {
    remove: [ 'script', 'noscript', 'style', 'iframe', 'object', 'hr', 'br + br', 'center' ],
    removeNoText: ['p'],
    removeData: ['img'],
    removeAttrs: {
        '*': [
            ...ONEVENT_ATTRS,
            'style', 'class', 'align',
        ],
        'img': [
            'border', 'crossorigin', 'height', 'hspace', 'ismap', 'longdesc', 'sizes', 'src', 'srcset',
            'usemap', 'vspace', 'width',
        ],
        'a': ['target'],
    },
    noComments: true,
};

function _mergeObjectArrays(obj1, obj2) {
    const keys1 = new Set(Object.keys(obj1));
    const keys2 = new Set(Object.keys(obj2));
    const toMerge = new Set([...keys1].filter(key => keys2.has(key)));

    const merged = {};
    toMerge.forEach(key => {
        merged[key] = [
            ...obj1[key],
            ...obj2[key],
        ];
    });

    return Object.assign(obj1, obj2, merged);
}

/**
 * Utility to extend {@link utilcleanup_body} defaults.
 *
 * @param {Object} options - Pass an Object with the same format as
 *   {@link utilCLEANUP_DEFAULTS}.
 * @returns {Object} - This is a merge of the {@link
 *   utilCLEANUP_DEFAULTS} and the passed options.
 * @memberof util
 */
function extend_cleanup_defaults({
    remove = [],
    removeNoText = [],
    removeData = [],
    removeAttrs = {},
    noComments,
} = {}) {
    const mergedRemoveAttrs = _mergeObjectArrays(CLEANUP_DEFAULTS.removeAttrs, removeAttrs);

    let mergedNoComments = CLEANUP_DEFAULTS.noComments;
    if (typeof noComments !== 'undefined') {
        mergedNoComments = noComments;
    }

    return {
        remove: [
            ...CLEANUP_DEFAULTS.remove,
            ...remove,
        ],
        removeNoText: [
            ...CLEANUP_DEFAULTS.removeNoText,
            ...removeNoText,
        ],
        removeData: [
            ...CLEANUP_DEFAULTS.removeData,
            ...removeData,
        ],
        removeAttrs: mergedRemoveAttrs,
        noComments: mergedNoComments,
    };
}

/**
 * Utility to remove the article body.
 *
 * The cleanup should be among the last operations done with the
 * body. For example, if your ingester tries to make Video assets from
 * iframes, the cleanup utility removes iframe elements by default.
 *
 * @param {Cheerio} body - The Cheerio object that will be cleaned
 *   up. Is called body because it usually represents an article body.
 * @param {Object} options - Options to configure the cleanup, by
 *   default {@link utilCLEANUP_DEFAULTS} is used. You can expand or
 *   override the defaults with {@link utilextend_cleanup_defaults}.
 * @param {Array} options.remove - Array of CSS selectors. The
 *   elements matching the selectors will be removed.
 * @param {Array} options.removeNoText - Array of CSS selectors. If
 *   the elements matching the selectors don’t have text inside, they
 *   will be removed.
 * @param {Array} options.removeData - Array of CSS selectors. Any
 *   custom data attribute will be removed from the matching
 *   elements.
 * @param {Object.<string, Array>} options.removeAttrs - Use this to
 *   remove attributes from elements. ‘removeAttrs’ is an Object with
 *   CSS selectors as keys and an Array of attributes as values.
 * @param {boolean} options.noComments - If true (default), all HTML
 *   comments will be removed from the body.
 * @memberof util
 */
function cleanup_body(body, {
    remove = CLEANUP_DEFAULTS.remove,
    removeNoText = CLEANUP_DEFAULTS.removeNoText,
    removeData = CLEANUP_DEFAULTS.removeData,
    removeAttrs = CLEANUP_DEFAULTS.removeAttrs,
    noComments = CLEANUP_DEFAULTS.noComments,
} = {}) {
    body.find(remove.join(',')).remove();

    body.find(removeNoText.join(','))
        .filter((i, elem) => cheerio(elem).text().trim() === '')
        .remove();

    const dataRegex = new RegExp('data-(?!(soma|libingester)-).*', 'g');
    body.find(removeData.join(','))
        .each((i, elem) => {
            Object.keys(elem.attribs).forEach(key => {
                if (key.match(dataRegex)) {
                    cheerio(elem).removeAttr(key);
                }
            });
        });

    Object.entries(removeAttrs).forEach(([ selector, attrs ]) => {
        attrs.forEach(attr => {
            body.find(selector)
                .removeAttr(attr);
        });
    });

    if (noComments) {
        const allElems = body.contents().add(body.find('*').contents());
        allElems.filter((index, node) => node.type === 'comment')
            .remove();
    }
}


module.exports = {
    cleanup_body,
    CLEANUP_DEFAULTS,
    create_wordpress_paginator,
    download_image,
    download_img,
    download_youtube_thumbnail,
    encode_uri,
    extend_cleanup_defaults,
    fetch_blog_article,
    fetch_html,
    fetch_news_article,
    fetch_rss_entries,
    get_doc_base_uri,
    get_embedded_video_asset,
    get_ingestion_limits,
    set_user_agent,
};
