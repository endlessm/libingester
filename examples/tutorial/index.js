const Cheerio = require('cheerio');
const {dom, out, props, rule, ruleset, score, type} = require('fathom-web');
const Futils = require('fathom-web/utils');
const JSDOM = require('jsdom/lib/old-api');
const Libingester = require('libingester');

class TutorialParser extends Libingester.HTMLArticleParser {

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

class TutorialIngester extends Libingester.WebIngester {
    get parserClass () {
        return TutorialParser;
    }

    get uriSources () {
        return [
            new Libingester.FeedGenerator('https://creativecommons.org/blog/feed/').getUris(),
        ];
    }
}

new TutorialIngester(__dirname).run();
