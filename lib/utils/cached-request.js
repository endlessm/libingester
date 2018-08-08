'use strict';

const os = require('os');
const path = require('path');
const request = require('request');

const logger = require('../logger');
const optional = require('./optional');

const _cachedRequestWrapper = optional('cached-request', { rethrow: true, moduleId: module.id });
const cachedRequest = _cachedRequestWrapper(request);

const CACHE_DIR = path.join(os.tmpdir(), 'libingester-cache', 'requests');
const TTL = 3600000;

cachedRequest.setCacheDirectory(CACHE_DIR);
cachedRequest.setValue('ttl', TTL);

logger.debug(`Caching requests to ${CACHE_DIR}, TTL: ${TTL}`);

const requestDefaults = {
    resolveWithFullResponse: true,
    headers: {
        'User-Agent': 'libingester',
    },
    pool: {
        maxSockets: 10,
    },
};

function cachedPooledRequest (options) {
    return new Promise((resolve, reject) => {
        const allOptions = { ...requestDefaults, ...options, gzip: false };
        cachedRequest(allOptions, (err, res, body) => {
            if (err) {
                return reject(err);
            }

            res.body = body;
            return resolve(res);
        });
    });
}

module.exports = {
    cachedPooledRequest,
    cachedRequest,
};
