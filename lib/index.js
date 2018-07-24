'use strict';

const logger = require('./logger');
const config = require('./config');
const processors = require('./processors');
const utils = require('./utils');

const Ingester = require('./ingester');
const WebIngester = require('./web-ingester');

const FeedGenerator = require('./feed-generator');

const Parser = require('./parser');
const HTMLArticleParser = require('./html-article-parser');

const Asset = require('./asset');

module.exports = {
    logger,
    config,
    utils,
    processors,

    Ingester,
    WebIngester,

    FeedGenerator,

    Parser,
    HTMLArticleParser,

    Asset,
};
