// eslint-disable-next-line no-nested-ternary
'use strict';

/** @namespace util */

const cheerio = require('cheerio');
const crypto = require('crypto');
const parseDataUrl = require('parse-data-url');
const request = require('request');
const url = require('url');

const config = require('./config');
const { logger } = require('./logging');
const somaDOM = require('./soma_dom');
const ImageAsset = require('./asset/imageAsset');
const VideoAsset = require('./asset/videoAsset');
const rss = require('./util/rss');
const { delayExecution, get_ingestion_limits } = require('./util/common');

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

function encodeUri(uri) {
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

function setUserAgent(userAgent) {
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
function fetchHtml(uri, encoding) {
    const encodedUri = encodeUri(uri);

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
 * @param {string} baseUri - Fallback base URI, should be the document's URI
 * @returns {string} - Base URI specified by the document if there is one,
 *   otherwise `baseUri`
 * @memberof util
 */
function getDocBaseUri(doc, baseUri) {
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
function getEmbeddedVideoAsset(videoTag, videoUri) {
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
function downloadImage(uri) {
    const encodedUri = encodeUri(uri);

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
 * Downloads a thumbnail image for the Youtube video specified by `$embedUrl`.
 *
 * @param {string} embedUrl - Youtube embed video URL
 * @returns {ImageAsset}
 * @memberof util
 */
function downloadYoutubeThumbnail(embedUrl) {
    const parsed = url.parse(embedUrl);
    const isYoutube = YOUTUBE_EMBED_DOMAINS.includes(parsed.hostname);
    if (isYoutube && parsed.pathname.includes('/embed/')) {
        const thumb = '/0.jpg';
        const path = parsed.pathname.replace('/embed/', '') + thumb;
        const baseUrlImg = 'http://img.youtube.com/vi/';
        const imgUrl = url.resolve(baseUrlImg, path);

        return downloadImage(imgUrl);
    }

    return null;
}

/**
 * Downloads an image specified by the `src` attribute of an `<img>` element
 * represented by `$img`. It modifies the `<img>` element to associate it with
 * the image asset, which will be used later on in the ingestion process.
 *
 * This is a convenience function which saves you from having to extract the
 * image URI yourself and pass it to {@link downloadImage}.
 *
 * Pass `baseUri` to handle relative links in the `src` attribute.
 *
 * @param {Cheerio} $img - DOM tree of an `<img>` element
 * @param {string} baseUri - Base URI of the document
 * @returns {ImageAsset}
 * @memberof util
 */
function downloadImageFromImgTag($img, baseUri = '') {
    if (typeof $img === 'string') {
        throw new Error('downloadImageFromImgTag requires a Cheerio object, ' +
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
        asset.set_canonical_uri(encodeUri(canonicalUri));
        asset.set_image_data(mediaType, binaryData);

        return asset;
    }

    const src = getImageSource($img, baseUri);

    // Knock these out.
    $img.attr('src', null);
    $img.attr('srcset', null);

    const asset = downloadImage(src);
    $img.attr('data-libingester-asset-id', asset.asset_id);
    $img.attr(somaDOM.Hint.Tag, somaDOM.Hint.ImportantImage);

    const linkWrapper = cheerio(`<a ${somaDOM.Widget.Tag}="${somaDOM.Widget.ImageLink}"></a>`);
    linkWrapper.append($img.clone());
    $img.replaceWith(linkWrapper);

    return asset;
}


module.exports = {
    download_image: downloadImage,
    download_img: downloadImageFromImgTag,
    download_youtube_thumbnail: downloadYoutubeThumbnail,
    encode_uri: encodeUri,
    fetch_html: fetchHtml,
    get_doc_base_uri: getDocBaseUri,
    get_embedded_video_asset: getEmbeddedVideoAsset,
    get_ingestion_limits,
    set_user_agent: setUserAgent,
    rss,

    // For backwards compatibility:
    create_wordpress_paginator: rss.create_wordpress_paginator,
    fetch_rss_entries: rss.fetch_rss_entries,
};
