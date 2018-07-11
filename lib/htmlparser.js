'use strict';

const _ = require('lodash');
const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const metascraper = require('metascraper');
const promiseRetry = require('promise-retry');
const request = require('request-promise-native');
const sanitizeHtml = require('sanitize-html');
const url = require('url');

const { logger } = require('./logger');
const { config } = require('./config');
const Parser = require('./parser');

const pooledRequest = request.defaults({
    resolveWithFullResponse: true,
    headers: {
        'User-Agent': 'libingester',
    },
    pool: {
        maxSockets: 10,
    },
});

class HtmlParser extends Parser {
    constructor (uri) {
        super();
        this.uri = uri;
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
            retries: config.maxRetries,
        });
    }

    get fieldsToParse () {
        return Object.keys(this.asset.metadata);
    }

    get metascraperExtraRules () {
        return [];
    }

    async parse () {
        try {
            const html = await this.fetch();

            this.$ = cheerio.load(html);
            this.metascraper = await metascraper({
                html,
                url: this.uri,
                rules: this.metascraperExtraRules,
            });

            for (const field of this.fieldsToParse) {
                const parseMethodName = `parse${_.upperFirst(field)}`;
                if (_.isFunction(this[parseMethodName])) {
                    this.asset.setMetadata(field, await this[parseMethodName](this.$));
                }
            }
        } catch (e) {
            logger.error(`Failed to parse ${this.uri}: ${e}\n${e.stack}`);
            this.asset.failed = true;
        }
    }

    extractBody () {
        return '';
    }

    sanitizeBody (body) {
        return sanitizeHtml(body, {

        });
    }

    get bodyProcessors () {
        return [];
    }

    async processBody (body) {
        const $body = cheerio.load(body);

        for (const bodyProcessor of this.bodyProcessors) {
            await bodyProcessor(this, $body);
        }

        return $body.html();
    }

    async parseBody () {
        let body = this.extractBody();

        if (!_.isString(body)) {
            body = body.html();
        }

        body = this.sanitizeBody(body);
        body = await this.processBody(body);

        return body;
    }

    parseCanonicalURI () {
        return this.metascraper.url;
    }

    parseTitle () {
        return this.metascraper.title;
    }

    parseSynopsis () {
        return this.metascraper.description;
    }

    parsePublishedDate () {
        return this.metascraper.date;
    }

    parseLastModifiedDate () {
        return this.parsePublishedDate();
    }

    parseSource () {
        return this.metascraper.publisher;
    }

    parseAuthors () {
        return [this.metascraper.author];
    }
}

module.exports = HtmlParser;
