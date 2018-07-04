'use strict';

const cheerio = require('cheerio');
const promiseRetry = require('promise-retry');
const url = require('url');

const logger = require('./logger');
const { FetchHtmlError } = require('./errors');
const Parser = require('./parser');

class HtmlParser extends Parser {
    constructor (uri, config) {
        super();
        this.uri = uri;
        this.config = config;
    }

    get encoding () {
        return 'utf-8';
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

        return promiseRetry((retry, attempt) => {
            logger.debug(`Fetching HTML ${encodedUri} (attempt ${attempt})`);


        });

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
            return body;
        });
    }

    async parse () {

    }
}

module.exports = HtmlParser;
