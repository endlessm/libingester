'use strict';

const PromisePool = require('es6-promise-pool');

const Ingester = require('./ingester');
const HTMLArticleParser = require('./html-article-parser');
const config = require('./config');
const { ImplementationError } = require('./errors');

/**
 * Ingester for HTML articles.
 *
 * The URLs of the articles to ingest are obtained in one of two ways:
 *
 * 1. Iterating URI sources, or
 * 2. Passed in config.urls
 *
 * URI sources are defined in the uriSources getter. Explicitly
 * passing the URIs by config takes precedence, and any URI sources
 * defined will be ignored in that case.
 *
 * parseUri() will be called for each of the articles URLs using the
 * parserClass.
 *
 * Usually you should extend this class and:
 *
 * - Define a custom parserClass.
 * - Define uriSources.
 *
 */
class WebIngester extends Ingester {
    get parserClass () {
        return HTMLArticleParser;
    }

    /**
     * Instatiate and use the parserClass to obtain an asset.
     */
    async parseUri (uri) {
        const ParserClass = this.parserClass;
        const parser = new ParserClass(uri);
        await parser.parse();
        await this.addAsset(parser.asset);
    }

    /**
     * Ingests the URIs.
     *
     * The maximum number of ingestions in parallel can be configured
     * using config.ingestPoolSize.
     */
    async ingest () {
        let uris = config.urls;

        if (!uris) {
            uris = await this._mergeUriSources();
        }

        // Used by the generator function since arrow functions cannot be used
        // along the generator syntax
        const self = this;

        const pool = new PromisePool(function *() {
            for (const uri of uris) {
                yield self.parseUri(uri);
            }
        }, config.ingestPoolSize);
        await pool.start();
    }

    get uriSources () {
        throw new ImplementationError('WebIngester.uriSources');
    }

    async _mergeUriSources () {
        // FIXME convert sources to iterators, and limit by date range
        // and number of items here.
        const allUris = [];
        for (const source of this.uriSources) {
            const uris = await source;
            allUris.push(...uris);
        }
        return allUris;
    }
}

module.exports = WebIngester;
