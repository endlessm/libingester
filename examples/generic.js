const { Ingester, ArticleParser } = require('libingester');

// Usage:
// node generic.js --urls https://...

class GenericIngester extends Ingester {
    get parserClass () {
        return ArticleParser;
    }
}

new GenericIngester().run();
