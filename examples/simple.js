const { HtmlParser, URIListIngester, FeedGenerator, logger } = require('libingester');

class SimpleIngester extends URIListIngester {
    get parserClass () {
        return HtmlParser;
    }

    get name () {
        return 'simple';
    }

    get language () {
        return 'es';
    }

    get uriSources () {
        const feedOptions = { feedUris: 'https://creativecommons.org/blog/feed/' };
        return [
            { 'class': FeedGenerator, 'options': feedOptions },
        ];
    }

    get feedUris () {
        return 'https://creativecommons.org/blog/feed/';
        // return [
        //     'http://www.prensalibre.com/rss?rss=Guatemala',
        //     'http://www.prensalibre.com/rss?rss=Deportes',
        //     'http://www.prensalibre.com/rss?rss=Economia',
        //     'http://www.prensalibre.com/rss?rss=Vida',
        //     'http://www.prensalibre.com/rss?rss=Internacional',
        //     'http://www.prensalibre.com/smartTV/departamental.xml',
        // ];
    }
}

new SimpleIngester().run();
