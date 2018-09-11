const libingester = require('libingester');

class MyParser extends libingester.HTMLArticleParser {
    parseTitle ($) {
        // Parse title from $ here
        return super.parseTitle($);
    }

    get bodyProcessors () {
        return [
            // Your processors here
            ...super.bodyProcessors,
        ];
    }

    extractBody ($) {
        // Extract body ffrom $ here
        return super.extractBody($);
    }
}

class MyIngester extends libingester.WebIngester {
    get parserClass () {
        return MyParser;
    }

    get uriSources () {
        return [
            // Add URI iterators here
        ];
    }
}

new MyIngester(__dirname).run();
