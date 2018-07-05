'use strict';

const PromisePool = require('es6-promise-pool');

const Ingester = require('./ingester');
const Parser = require('./parser');
const config = require('./config');

class URIListIngester extends Ingester {
    get parserClass () {
        return Parser;
    }

    async ingest () {
        let uris = config.urls;

        if (!uris) {
            uris = this.uris;
        }

        const pool = new PromisePool(function *() {
            for (const uri of uris) {
                const ParserClass = this.parserClass;
                const parser = new ParserClass(uri);
                yield parser.parse();
                this.addAsset(parser.asset);
            }
        }, config.ingestPoolSize);
        pool.start();
    }

    get uris () {
        throw new Error('You have to implement the uris() getter.');
    }
}

module.exports = URIListIngester;
