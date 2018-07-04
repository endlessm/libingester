'use strict';

const URIListIngester = require('./urilistingester');

class FeedIngester extends URIListIngester {
    ingest () {
        console.log(this.feedUris);
    }

    get feedUris () {
        throw new Error('You have to implement the uris() getter.');
    }

    get uris () {
        return this.entries.map(entry => entry.link);
    }
}

module.exports = FeedIngester;
