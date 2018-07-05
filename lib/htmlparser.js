'use strict';

const cheerio = require('cheerio');
const promiseRetry = require('promise-retry');
const request = require('request-promise-native');
const url = require('url');

const logger = require('./logger');
const Parser = require('./parser');

const pooledRequest = request.defaults({
    headers: {
        'User-Agent': 'libingester',
    },
    pool: {
        maxSockets: 10,
    },
});

class HtmlParser extends Parser {
    constructor (uri, config) {
        super();
        this.uri = uri;
        this.config = config;
        this.$ = null;
    }

    get encoding () {
        return 'utf8';
    }

    _encodeUri (uri) {
        return encodeURI(url.format(url.parse(uri)));
    }

    async fetch () {
        const encodedUri = this._encodeUri(this.uri);

        const options = {
            uri: encodedUri,
            gzip: true,
            encoding: this.encoding,
        };

        return promiseRetry(async (retry, attempt) => {
            logger.info(`Fetching HTML ${encodedUri} (attempt ${attempt})`);

            const response = await pooledRequest(options);

            if (response.statusCode >= 300) {
                logger.error(`Request for page ${encodedUri} got a non-successful ` +
                             `status code ${response.statusCode}`);
                retry();
            }

            const contentType = response.headers['content-type'];
            if (contentType.match(/^text\/html/i) === null) {
                logger.error(`Request for page ${encodedUri} got a content type ` +
                             `different than text/html: ${contentType}`);
                retry();
            }

            return response.body;
        }, {
            retries: this.config.maxRetries,
        });
    }

    get fieldsToParse () {
        return Object.keys(this.asset.metadata);
    }

    async parse () {
        this.$ = cheerio.load(await this.fetch());

        for (const field in this.fieldsToParse) {

        }
    }
}

module.exports = HtmlParser;
