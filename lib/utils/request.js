'use strict';

const request = require('request-promise-native');
const promiseRetry = require('promise-retry');
const imageType = require('image-type');
const url = require('url');

const { config } = require('../config');
const { logger } = require('../logger');
const Asset = require('../asset');

const requestDefaults = {
    resolveWithFullResponse: true,
    headers: {
        'User-Agent': 'libingester',
    },
    pool: {
        maxSockets: 10,
    },
};

function _getPooledRequest () {
    if (config.liveMode) {
        const { cachedPooledRequest } = require('./cached-request');
        return cachedPooledRequest;
    }
    return request.defaults(requestDefaults);
}

const pooledRequest = _getPooledRequest();

function _encodeUri (uri) {
    return encodeURI(url.format(url.parse(uri)));
}

function _getContentType (response, encodedUri) {
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

async function _downloadImageRetrying (asset, uri, retry, attempt) {
    const encodedUri = _encodeUri(uri);

    const options = {
        uri: encodedUri,
        encoding: null,
    };

    const response = await pooledRequest(options);

    logger.debug(`Downloading image ${encodedUri}`);
    if (response.statusCode >= 300) {
        logger.error(`Request for page ${encodedUri} got a non-successful ` +
                     `status code ${response.statusCode}`);
        logger.info(`Delaying download of ${encodedUri} (attempt ${attempt})`);
        retry();
    }

    const contentType = _getContentType(response, encodedUri);
    asset.setMetadata('contentType', contentType);

    asset.data = response.body;
}

function downloadImage (uri) {
    const asset = new Asset();
    // FIXME title, more metadata
    asset.setMetadata({
        objectType: 'ImageObject',
        canonicalURI: uri,
    });

    const _doDownload = (retry, attempt) => {
        return _downloadImageRetrying(asset, uri, retry, attempt);
    };
    asset.data = promiseRetry(_doDownload, { retries: config.maxRetries,
                                             minTimeout: config.retryBackoffDelay });
    return asset;
}

module.exports = {
    pooledRequest,
    downloadImage,
};
