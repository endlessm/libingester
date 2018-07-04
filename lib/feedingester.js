'use strict';

const Ingester = require('./ingester');

class FeedIngester extends Ingester {
    ingest () {
        console.log(this.feedUris);
    }

    get feedUris () {
        throw new Error('You have to implement the uris() getter.');
    }
}

module.exports = FeedIngester;
