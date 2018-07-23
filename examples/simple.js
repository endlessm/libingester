const { Ingester, ArticleParser, FeedGenerator, logger } = require('libingester');

class SimpleIngester extends Ingester {
    get parserClass () {
        return ArticleParser;
    }

    get name () {
        return 'simple';
    }

    get language () {
        return 'es';
    }

    get uriSources () {
        return [
            //['https://creativecommons.org/2018/07/20/cc-certificates/'],
            new FeedGenerator('https://creativecommons.org/blog/feed/').getUris(),
        ]
    }
}

new SimpleIngester().run();
