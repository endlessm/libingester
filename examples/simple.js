const { FeedIngester, logger } = require('libingester');

class SimpleIngester extends FeedIngester {
    get language () {
        return 'es';
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
