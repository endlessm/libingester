'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const promiseRetry = require('promise-retry');
const request = require('request-promise-native');
const url = require('url');
const imageType = require('image-type');

const Asset = require('./asset');
const somaDOM = require('./somadom');
const { config } = require('./config');
const { logger } = require('./logger');

// FIXME reuse it
const pooledRequest = request.defaults({
    resolveWithFullResponse: true,
    headers: {
        'User-Agent': 'libingester',
    },
    pool: {
        maxSockets: 10,
    },
});

class ImagesProcessor {
    static _encodeUri (uri) {
        return encodeURI(url.format(url.parse(uri)));
    }

    static _getImageSource ($img, baseUri = '') {
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

    static _getContentType (response) {
        const contentType = response.headers['content-type'];
        if (contentType.match(/^image/i)) {
            return contentType;
        }

        const imageTypeFromContent = imageType(response.body);
        if (imageTypeFromContent) {
            return imageTypeFromContent.mime;
        }

        throw new Error(`Request for image ${encodedUri} resulted in a ` +
                        `non-image: ${contentType}`);
    }

    static async _downloadImageRetrying (asset, uri, retry, attempt) {
        const encodedUri = ImagesProcessor._encodeUri(uri);

        const options = {
            uri: encodedUri,
            encoding: null,
        };

        const response = await pooledRequest(options);

        if (response.statusCode >= 300) {
            logger.error(`Request for page ${encodedUri} got a non-successful ` +
                         `status code ${response.statusCode}`);
            logger.info(`Delaying download of ${encodedUri} (attempt ${attempt})`);
            retry();
        }

        const contentType = ImagesProcessor._getContentType(response);
        asset.setMetadata('contentType', contentType);

        asset.data = response.body;
    }

    static async downloadImage (asset, uri) {
        const _downloadImageRetrying = (retry, attempt) => {
            return ImagesProcessor._downloadImageRetrying(asset, uri, retry, attempt);
        };
        return promiseRetry(_downloadImageRetrying, { retries: config.maxRetries,
                                                      minTimeout: config.retryBackoffDelay });
    }

    async process ($body) {
        const imageAssets = [];

        $body('img').each((i, elem) => {
            const $img = cheerio(elem);

            // FIXME case of data src

            const src = ImagesProcessor._getImageSource($img);

            const asset = new Asset();
            asset.data = ImagesProcessor.downloadImage(asset, src);
            asset.setMetadata('objectType', 'ImageObject');
            asset.setMetadata('canonicalURI', src);
            // FIXME title, more metadata
            imageAssets.push(asset);

            $img.attr('src', null);
            $img.attr('srcset', null);
            // FIXME original libingester does this, then replaces it:
            // $img.attr('data-libingester-asset-id', asset.id);
            $img.attr('data-soma-job-id', asset.id);
            $img.attr(somaDOM.Hint.Tag, somaDOM.Hint.ImportantImage);

            const $linkWrapper = cheerio('<a></a>');
            $linkWrapper.attr(somaDOM.Widget.Tag, somaDOM.Widget.ImageLink);

            $img.wrap($linkWrapper);
        });

        return imageAssets;
    }
}

module.exports = ImagesProcessor;
