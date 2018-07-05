'use strict';

const PromisePool = require('es6-promise-pool');

const Ingester = require('./ingester');
const Parser = require('./parser');
const config = require('./config');

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

    get uris () {
        throw new Error('You have to implement the uris() getter.');
    }
}

module.exports = URIListIngester;
