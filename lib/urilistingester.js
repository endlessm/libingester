'use strict';

const PromisePool = require('es6-promise-pool');

const Ingester = require('./ingester');
const Parser = require('./parser');

class URIListIngester extends Ingester {
    get parserClass () {
        return Parser;
    }

    async ingest () {
        let uris = this.config.urls;

        if (!uris) {
            uris = this.uris;
        }

        const pool = new PromisePool(function *() {
            for (const uri of uris) {
                const ParserClass = this.parserClass;
                const parser = new ParserClass(uri, this.config);
                yield parser.parse();
                this.addAsset(parser.asset);
            }
        }, this.config.ingestPoolSize);
        pool.start();
    }

    get uris () {
        throw new Error('You have to implement the uris() getter.');
    }
}

module.exports = URIListIngester;
