'use strict';

const request = require('request-promise-native');

const pooledRequest = request.defaults({
    resolveWithFullResponse: true,
    headers: {
        'User-Agent': 'libingester',
    },
    pool: {
        maxSockets: 10,
    },
});

module.exports = {
    pooledRequest,
};
