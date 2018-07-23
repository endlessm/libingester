const { WebIngester, HTMLArticleParser } = require('libingester');

// Usage:
// node generic.js --urls https://...

class GenericIngester extends WebIngester {
    get parserClass () {
        return HTMLArticleParser;
    }
}

new GenericIngester().run();
