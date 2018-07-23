'use strict';

const Ingester = require('./ingester');
const BaseIngester = require('./base-ingester');
const FeedGenerator = require('./feed-generator');
const { logger } = require('./logger');
const { config } = require('./config');

const Parser = require('./parser');
const ArticleParser = require('./article-parser');

const Asset = require('./asset');

module.exports = {
    logger,
    config,
    Ingester,
    BaseIngester,
    FeedGenerator,
    Parser,
    ArticleParser,
    Asset,
};
