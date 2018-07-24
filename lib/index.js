'use strict';

const Ingester = require('./ingester');
const WebIngester = require('./web-ingester');
const FeedGenerator = require('./feed-generator');
const logger = require('./logger');
const config = require('./config');

const Parser = require('./parser');
const HTMLArticleParser = require('./html-article-parser');

const Asset = require('./asset');

module.exports = {
    logger,
    config,
    Ingester,
    WebIngester,
    FeedGenerator,
    Parser,
    HTMLArticleParser,
    Asset,
};
