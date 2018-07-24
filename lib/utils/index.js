const request = require('./request');
const browserFetch = require('./browser-fetch');
const scraper = require('./scraper');

module.exports = {
    request: request.request,
    requestDefaults: request.requestDefaults,
    browserFetch: browserFetch.browserFetch,
    scraper: scraper,
};
