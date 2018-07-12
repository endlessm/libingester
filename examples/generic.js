const { HtmlParser, URIListIngester } = require('libingester');

// Usage:
// node generic.js --urls https://...

class GenericIngester extends URIListIngester {
    get parserClass () {
        return HtmlParser;
    }
}

new GenericIngester().run();
