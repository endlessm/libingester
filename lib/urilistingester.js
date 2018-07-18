'use strict';

const _ = require('lodash');
const PromisePool = require('es6-promise-pool');

const Ingester = require('./ingester');
const Parser = require('./parser');
const { config } = require('./config');
const { ImplementationError } = require('./errors');

class URIListIngester extends Ingester {
    get parserClass () {
        return Parser;
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
            uris = this.uris;
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

    *_mergeUriSources () {
        for (const source of this.uriSources) {
            if (_.isFunction(source)) {
                yield* source();
            }
            if (_.isPlainObject(source)) {
                if ('func' in source) {
                    yield* source['func'](source['options']);
                }
                if ('class' in source) {
                    const SourceClass = source['class'];
                    const obj = new SourceClass(source['oprions']);
                    yield* obj.getUris();
                }
            }
            if (_.isArray(source)) {
                for (const uri of source) {
                    yield uri;
                }
            }
        }
    }

    get uriSources () {
        throw new ImplementationError('URIListIngester.uriSources');
    }

    get uris () {
        return this._mergeUriSources();
    }
}

module.exports = URIListIngester;
