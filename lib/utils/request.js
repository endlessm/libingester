'use strict';

const request = require('request-promise-native');
const promiseRetry = require('promise-retry');
const url = require('url');

const config = require('../config');
const logger = require('../logger');

const requestDefaults = {
    resolveWithFullResponse: true,
    headers: {
        'User-Agent': 'libingester',
    },
    pool: {
        maxSockets: 10,
    },
};

let requestWrapper = null;

function getRequestWrapper () {
    if (!requestWrapper) {
        if (config.liveMode) {
            const { cachedPooledRequest } = require('./cached-request');
            requestWrapper = cachedPooledRequest;
        } else {
            requestWrapper = request.defaults(requestDefaults);
        }
    }

    return requestWrapper;
}

function _request (uri, options = {}) {
    const encodedUri = encodeURI(url.format(url.parse(uri)));

    const mergedOptions = {
        uri: encodedUri,
        gzip: true,
        encoding: null,
        ...options,
    };

    return promiseRetry(async (retry, attempt) => {
        logger.debug(`Fetching ${encodedUri} (attempt ${attempt})`);

        const response = await getRequestWrapper()(mergedOptions);

        if (response.statusCode >= 300) {
            logger.error(`Request for ${encodedUri} got a non-successful status ` +
                         `code ${response.statusCode}, retrying (attempt ${attempt})`);
            retry();
        }

        return response;
    }, {
        retries: config.maxRetries,
        minTimeout: config.retryBackoffDelay,
    });
}

module.exports = {
    request: _request,
    getRequestWrapper,
};
