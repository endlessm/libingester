const libingester = require('libingester');

class TutorialParser extends libingester.HTMLArticleParser {

    parseTitle ($) {
        return super.parseTitle($).replace(/ - Creative Commons$/,'');
    }

    get bodyProcessors () {
        return [
            this.processWithFathom,
            ...super.bodyProcessors,
        ];
    }

    extractBody ($) {
        // Extract body ffrom $ here
        return super.extractBody($);
    }

    processWithFathom ($body) {
        // FIXME
        return { $body };
    }
}

class TutorialIngester extends libingester.WebIngester {
    get parserClass () {
        return TutorialParser;
    }

    get uriSources () {
        return [
            new libingester.FeedGenerator('https://creativecommons.org/blog/feed/').getUris(),
        ];
    }
}

new TutorialIngester(__dirname).run();
