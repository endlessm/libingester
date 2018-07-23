'use strict';

const os = require('os');
const path = require('path');
const zlib = require('zlib');
const request = require('request');
const cachedRequest = require('cached-request')(request);

const { logger } = require('../logger');

const CACHE_DIR = path.join(os.tmpdir(), 'libingester-cache/');
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
        const allOptions = { ...requestDefaults, ...options };
        cachedRequest(allOptions, (err, res) => {
            if (err) {
                return reject(err);
            }

            const isCachedHTML = res.headers['content-type'].match(/^text\/html/i) &&
                  res.body instanceof Buffer;

            if (isCachedHTML) {
                res.body = zlib.gunzipSync(res.body).toString();
            }

            return resolve(res);
        });
    });
}

module.exports = {
    cachedPooledRequest,
};
