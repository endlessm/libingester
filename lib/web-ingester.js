'use strict';

const PromisePool = require('es6-promise-pool');

const Ingester = require('./ingester');
const HTMLArticleParser = require('./html-article-parser');
const config = require('./config');
const { ImplementationError } = require('./errors');

class WebIngester extends Ingester {
    get parserClass () {
        return HTMLArticleParser;
    }

    async parseUri (uri) {
        const ParserClass = this.parserClass;
        const parser = new ParserClass(uri);
        await parser.parse();
        await this.addAsset(parser.asset);
    }

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
