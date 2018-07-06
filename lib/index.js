'use strict';

const Ingester = require('./ingester');
const URIListIngester = require('./urilistingester');
const FeedIngester = require('./feedingester');
const logger = require('./logger');
const config = require('./config');

const Parser = require('./parser');
const HtmlParser = require('./htmlparser');

const Asset = require('./asset');

module.exports = {
    logger,
    config,
    Ingester,
    URIListIngester,
    FeedIngester,
    Parser,
    HtmlParser,
    Asset,
};
