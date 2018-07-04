'use strict';

const Ingester = require('./ingester');

class URIListIngester extends Ingester {
    ingest () {
        console.log(this.uris);
    }

    get uris () {
        throw new Error('You have to implement the uris() getter.');
//        return [];
    }
}

module.exports = URIListIngester;
