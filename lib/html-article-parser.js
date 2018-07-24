'use strict';

const _ = require('lodash');
const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const url = require('url');

const Asset = require('./asset');
const Parser = require('./parser');
const { IngestError } = require('./errors');
const logger = require('./logger');
const config = require('./config');
const utils = require('./utils');
const { processImages } = require('./processors/images-processor');
const { processYoutubeEmbeds } = require('./processors/youtube-embeds-processor');
const { processCleanup } = require('./processors/cleanup-processor');

class HTMLArticleParser extends Parser {
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
        if (config.headlessBrowser) {
            return utils.browserFetch.fetch(this.uri);
        }

        return (await utils.request(this.uri)).body;
    }

    get fieldsToParse () {
        return Object.keys(this.asset.metadata);
    }

    get scraperExtraRules () {
        return [];
    }

    async parse () {
        try {
            const html = await this.fetch();

            this.$ = cheerio.load(html);
            this.scraped = await utils.scraper({
                html,
                url: this.uri,
                rules: this.scraperExtraRules,
            });

            for (const field of this.fieldsToParse) {
                const parseMethodName = `parse${_.upperFirst(field)}`;
                if (_.isFunction(this[parseMethodName])) {
                    this.asset.setMetadata(field, await this[parseMethodName](this.$));
                }
            }

            await this.render();
        } catch (e) {
            logger.error(`Failed to parse ${this.uri}: ${e}\n${e.stack}`);
            this.asset.failed = true;
        }
    }

    async renderAsset (asset) {
        if (!asset.metadata.body) {
            return;
        }

        for (const child of asset.children) {
            await this.renderAsset(child);
        }

        const $body = cheerio(asset.metadata.body);

        $body.find('libingester-asset').each((i, childAssetElement) => {
            const $childAssetElement = cheerio(childAssetElement);
            const assetId = $childAssetElement.attr('data-libingester-id');
            const childAsset = asset.getChildById(assetId);

            if (!childAsset) {
                throw new IngestError(
                    `Found a libingester-asset element referring to an unexistent child: ${assetId}`
                );
            }

            $childAssetElement.replaceWith(childAsset.metadata.body);
        });

        asset.metadata.body = $body.toString();
    }

    async render () {
        await this.renderAsset(this.asset);
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

    get bodyProcessors () {
        return [
            processImages,
            processYoutubeEmbeds,
            processCleanup({}, true),
        ];
    }

    async processBody ($body) {
        let $processedBody = $body;

        for (const processor of this.bodyProcessors) {
            const result = await processor.bind(this)($processedBody);

            if (_.isString(result.$body)) {
                result.$body = cheerio.load(result.$body);
            }
            $processedBody = result.$body;

            if (result.assets) {
                this.asset.children.push(...result.assets);
            }
        }

        return $processedBody;
    }

    async parseBody ($) {
        let $body = this.extractBody($);

        if (_.isString($body)) {
            $body = cheerio.load($body);
        }

        $body = await this.processBody($body);
        return `<div>${$body.html()}</div>`;
    }

    parseCanonicalURI () {
        return this.scraped.canonicalURI;
    }

    parseObjectType () {
        return Asset.ARTICLE_OBJECT_TYPE;
    }

    parseContentType () {
        return 'text/html';
    }

    parseTitle () {
        return this.scraped.title;
    }

    parseSynopsis () {
        return this.scraped.synopsis;
    }

    parsePublishedDate () {
        return this.scraped.publishedDate;
    }

    parseLastModifiedDate () {
        return this.parsePublishedDate();
    }

    parseSource () {
        return this.scraped.source;
    }

    parseAuthors () {
        return [this.scraped.author];
    }
}

module.exports = HTMLArticleParser;
