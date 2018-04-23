'use strict';

const request = require('request');
const Feedparser = require('feedparser');

const config = require('../config');
const { logger } = require('../logging');
const { delayExecution, get_ingestion_limits } = require('./common');

const getIngestionLimits = get_ingestion_limits;

/** @module util/rss */

function _fetchRssPage(feed, page, items, allLinks, maxItems, oldestDate) {
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

    return _fetchRssJsonWithRetry(feedUrl).then(feedJson => {
        const recentEnoughItems = feedJson.items
              .filter(item => item.pubdate >= oldestDate);

        const limitedItems = [];
        recentEnoughItems.slice(0, maxItems - items.length).forEach(item => {
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

        if (typeof feedObj !== 'function' && _isWordpressFeed(feedJson)) {
            logger.debug('Wordpress feed found, adding pagination');
            isPaginated = true;
            const newFeed = _doCreateWordpress(feedObj);
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
        return _fetchRssPage(feed, newPage, newItems, allLinks, maxItems, oldestDate);
    });
}

/**
 * A utility for fetching entries from an RSS feed for further processing.
 *
 * The `max_items` and `max_days_old` parameters can be overridden by the
 * `LIBINGESTER_MAX_ITEMS` and `LIBINGESTER_MAX_DAYS_OLD` environment
 * variables, respectively.
 *
 * @param {string|Array|Function} feed - URL of RSS feed to read, or an array of
 *   URLs of RSS feeds to read, or a paginator function that returns a URL given
 *   a page number
 * @param {number} [max_items=Infinity] - Maximum number of entries to return
 * @param {number} [max_days_old=1] - Maximum age of entries returned, in days
 * @returns {Promise<Object[]>} - Array of RSS feed entries
 * @memberof util/rss
 */
function fetchRssEntries(feed, max_items = Infinity, max_days_old = 1) {
    // Allow environment variables to override this
    const limits = getIngestionLimits(max_items, max_days_old);

    return _fetchRssPage(feed, 1, [], new Set(), limits.max_items,
                         limits.oldest_date);
}

function _fetchRssJson(feedUrl) {
    return new Promise((resolve, reject) => {
        const req = request.get(feedUrl);
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

function _isWordpressFeed(feedJson) {
    const hasGenerator = feedJson.meta.generator &&
          feedJson.meta.generator.startsWith('https://wordpress.org/');
    const hasXmlns = feedJson.meta['rss:site'] &&
          feedJson.meta['rss:site']['@'] &&
          feedJson.meta['rss:site']['@'].xmlns &&
          feedJson.meta['rss:site']['@'].xmlns.startsWith('com-wordpress');

    return hasGenerator || hasXmlns;
}

function _fetchRssJsonWithRetry(feedUrl, attempt = 1) {
    const maxRetries = parseInt(config.get_setting('max-retries'), 10);
    const retryBackoffDelay = parseInt(config.get_setting('retry-backoff-delay'), 10);

    return _fetchRssJson(feedUrl).catch(err => {
        if (attempt > maxRetries) {
            logger.warn(`Max retries (${maxRetries}) exceeded!`);
            throw err;
        }

        const shouldRetry = err.message.match('Unexpected end') ||
                            err.message.match('Not a feed');
        if (shouldRetry) {
            const timeout = Math.pow(2, attempt) * retryBackoffDelay;
            logger.debug(`Delaying execution of ${feedUrl} by ${timeout}`);

            return delayExecution(timeout).then(() => {
                return _fetchRssJsonWithRetry(feedUrl, attempt + 1);
            });
        }

        // We reach here if unexpected error
        throw err;
    });
}

function _doCreateWordpress(feed) {
    return function (pageNum) {
        return `${feed}?paged=${pageNum}`;
    };
}

/**
 * A utility to create a pagination function for Wordpress-generated feeds,
 * since they are so common. Make sure to verify that your feed is generated by
 * Wordpress before using this!
 * @param {string|Array} feed - The URL of the RSS feed (first page), or an
 *   array of URLs of RSS feeds
 * @returns {function} - A paginator function that can be passed to
 *   {@link #utilrssfetchrssentries|util.rss.fetchRssEntries}
 * @memberof util/rss
 */
function createWordpressPaginator(feed) {
    if (Array.isArray(feed)) {
        return feed.map(uri => _doCreateWordpress(uri));
    }
    return _doCreateWordpress(feed);
}


module.exports = {
    create_wordpress_paginator: createWordpressPaginator,
    fetch_rss_entries: fetchRssEntries,
};
