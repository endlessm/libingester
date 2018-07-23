'use strict';

const _ = require('lodash');
const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const metascraper = require('metascraper');
const promiseRetry = require('promise-retry');
const sanitizeHtml = require('sanitize-html');
const url = require('url');

const { logger } = require('./logger');
const { config } = require('./config');
const { pooledRequest, downloadImage } = require('./utils/request');
const Parser = require('./parser');
const { processImages } = require('./processors/images-processor');
const { processYoutubeEmbeds } = require('./processors/youtube-embeds-processor');
const { processCleanup } = require('./processors/cleanup-processor');

class ArticleParser extends Parser {
    constructor (uri) {
        super();
        this.uri = uri;
        this.$ = null;
    }

    get encoding () {
        return 'utf8';
    }

    static _encodeUri (uri) {
        return encodeURI(url.format(url.parse(uri)));
    }

    async fetch () {
        const encodedUri = ArticleParser._encodeUri(this.uri);
        if (config.headlessBrowser) {
            const browserfetch = require('./utils/browserfetch');
            return browserfetch.fetch(encodedUri);
        }

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

    getMeta (name) {
        let $meta = this.$(`meta[property="${name}"]`);

        if ($meta.length === 0) {
            $meta = this.$(`meta[name="${name}"]`);
        }

        return $meta.attr('content');
    }

    extractBody ($) {
        // FIXME add here more common selectors for main content:
        return $('article');
    }

    sanitizeBody (body) {
        return sanitizeHtml(body, {

        });
    }

    get bodyProcessors () {
        return [
            processImages,
            processYoutubeEmbeds,
            processCleanup,
        ];
    }

    async processBody (body) {
        let $body = cheerio.load(body);

        for (const processor of this.bodyProcessors) {
            const { $newBody, assets = [] } = await processor($body);
            $body = $newBody;
            this.asset.children.push(...assets);
        }

        return $body.html();
    }

    // FIXME this should be the last one
    async parseDocument ($) {
        let body = this.extractBody($);

        if (!_.isString(body)) {
            body = body.html();
        }

        // FIXME this removes iframes needed to process videos:
        // body = this.sanitizeBody(body);
        body = await this.processBody(body);
        return body;
    }

    parseCanonicalURI () {
        return this.metascraper.url;
    }

    parseObjectType () {
        return 'ArticleObject';
    }

    parseContentType () {
        return 'text/html';
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

    parseThumbnail () {
        if (this.metascraper.image) {
            const thumbAsset = downloadImage(this.metascraper.image);
            this.asset.children.push(thumbAsset);
            return thumbAsset.id;
        }
        return null;
    }
}

module.exports = ArticleParser;
