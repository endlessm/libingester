'use strict';

const URIListIngester = require('./urilistingester');
const logger = require('./logger');

const promiseRetry = require('promise-retry');
const request = require('request');
const Feedparser = require('feedparser');
const partial = require('lodash/partial');

class FeedIngester extends URIListIngester {
    _fetchRssJson (feedUrl, requestOptions) {
        return new Promise((resolve, reject) => {
            const reqOptions = requestOptions || {};
            reqOptions.url = feedUrl;
            const req = request.get(reqOptions);
            const parser = new Feedparser();

            req.on('error', reject);
            parser.on('error', reject);

            const feedData = { items: [] };

            parser.on('meta', meta => {
                feedData.meta = meta;
            });

            parser.on('data', article => {
                feedData.items.push(article);
            });

            parser.on('end', () => resolve(feedData));

            req.pipe(parser);
        });
    }

    _isWordpressFeed (feedJson) {
        const hasGenerator = feedJson.meta.generator &&
              feedJson.meta.generator.startsWith('https://wordpress.org/');
        const hasXmlns = feedJson.meta['rss:site'] &&
              feedJson.meta['rss:site']['@'] &&
              feedJson.meta['rss:site']['@'].xmlns &&
              feedJson.meta['rss:site']['@'].xmlns.startsWith('com-wordpress');

        return hasGenerator || hasXmlns;
    }

    _doCreateWordpress (feed) {
        return function (pageNum) {
            return `${feed}?paged=${pageNum}`;
        };
    }

    _doRetry (feedUrl, requestOptions, retry, number) {
        return this._fetchRssJson(feedUrl, requestOptions).catch(err => {

            const shouldRetry = err.message.match('Unexpected end') ||
                  err.message.match('Not a feed') ||
                  // This is a DNS resolution error, not a 404:
                  err.code === 'ENOTFOUND';

            if (shouldRetry) {
                logger.debug(`Delaying execution of ${feedUrl}, attempt ${number}`);
                retry(err);
            }

            throw err;
        });

    }

    _fetchRssJsonWithRetry (feedUrl, requestOptions) {
        const _doRetry = partial(this._doRetry.bind(this), feedUrl, requestOptions);
        return promiseRetry(_doRetry, {retries: this.config.maxRetries,
                                       minTimeout: this.config.retryBackoffDelay});
    }

    _fetchRssPage (feed, page, items, allLinks, requestOptions) {
        // FIXME requestOptions to config

        let isPaginated = false;
        let feedUrl;

        let feedObj = feed;
        if (Array.isArray(feed)) {
            feedObj = feed[0];
        }

        if (typeof feedObj === 'function') {
            isPaginated = true;
            feedUrl = feedObj(page);
        } else {
            feedUrl = feedObj;
        }

        if (!feedUrl) {
            return items;
        }

        logger.debug(`Fetching RSS ${feedUrl}`);

        return this._fetchRssJsonWithRetry(feedUrl, requestOptions).then(feedJson => {
            const recentEnoughItems = feedJson.items
                  .filter(item => item.pubdate >= this.oldestDate);

            const limitedItems = [];
            recentEnoughItems.slice(0, this.config.maxItems - items.length).forEach(item => {
                if (!allLinks.has(item.link)) {
                    limitedItems.push(item);
                    allLinks.add(item.link);
                }
            });

            const newItems = items.concat(limitedItems);

            // If we've run into articles which are too old, or we've hit the max
            // number of items, cease crawling
            const doneCrawling = feedJson.items.length === 0 ||
                  limitedItems.length < feedJson.items.length;

            if (typeof feedObj !== 'function' && this._isWordpressFeed(feedJson)) {
                logger.debug('Wordpress feed found, adding pagination');
                isPaginated = true;
                const newFeed = this._doCreateWordpress(feedObj);
                if (Array.isArray(feed)) {
                    feed.shift();
                    // eslint-disable-next-line no-param-reassign
                    feed = [newFeed].concat(feed);
                } else {
                    // eslint-disable-next-line no-param-reassign
                    feed = newFeed;
                }
            }

            // eslint-disable-next-line no-extra-parens
            const _continue = Array.isArray(feed) || (!doneCrawling && isPaginated);

            if (!_continue) {
                return newItems;
            }

            let newPage;
            if (doneCrawling && isPaginated && Array.isArray(feed)) {
                feed.shift();
                newPage = 1;
            } else if (isPaginated) {
                newPage = page + 1;
            } else if (Array.isArray(feed)) {
                feed.shift();
                newPage = 1;
            }
            return this._fetchRssPage(feed, newPage, newItems, allLinks, requestOptions);
        });
    }

    async ingest () {
        this.entries = await this._fetchRssPage(this.feedUris, 1, [], new Set());
    }

    get oldestDate () {
        const oldestDate = new Date();
        oldestDate.setDate(oldestDate.getDate() - this.config.maxDaysOld);
        return oldestDate;
    }

    get feedUris () {
        throw new Error('You have to implement the uris() getter.');
    }

    get uris () {
        return this.entries.map(entry => entry.link);
    }
}

module.exports = FeedIngester;
