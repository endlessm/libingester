'use strict';

const request = require('request');
const feedparser = require('feedparser');
const { logger } = require('../logging');
const config = require('../config');
const { delayExecution, get_ingestion_limits } = require('../util');

/** @module util/rss */

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
function fetch_rss_entries (feed, max_items=Infinity, max_days_old=1) {
    // Allow environment variables to override this
    const limits = get_ingestion_limits(max_items, max_days_old);

    return _fetch_rss_page(feed, 1, [], new Set(), limits.max_items,
                           limits.oldest_date);
}

function _fetch_rss_json (feed_url) {
    return new Promise((resolve, reject) => {
        const req = request.get(feed_url);
        const parser = new feedparser();

        req.on('error', reject);
        parser.on('error', reject);

        const feed_data = { items: [] };
        parser.on('meta', meta => feed_data.meta = meta);
        parser.on('data', article => feed_data.items.push(article));
        parser.on('end', () => resolve(feed_data));

        req.pipe(parser);
    });
}

function _is_wordpress_feed(feed_json) {
    const has_generator = feed_json.meta.generator &&
          feed_json.meta.generator.startsWith('https://wordpress.org/');
    const has_xmlns = feed_json.meta['rss:site'] &&
          feed_json.meta['rss:site']['@'] &&
          feed_json.meta['rss:site']['@']['xmlns'] &&
          feed_json.meta['rss:site']['@']['xmlns'].startsWith('com-wordpress');
    return has_generator || has_xmlns;
}

function _fetch_rss_json_retrying(feed_url, attempt=1) {
    const max_retries = parseInt(config.get_setting('max-retries'));
    const retry_backoff_delay = parseInt(config.get_setting('retry-backoff-delay'));
    return _fetch_rss_json(feed_url).catch(err => {
        if (attempt > max_retries) {
            logger.warn(`Max retries (${max_retries}) exceeded!`);
            throw err;
        }

        const should_retry = (err.message.match('Unexpected end') ||
                              err.message.match('Not a feed'));
        if (should_retry) {
            const timeout = Math.pow(2, attempt) * retry_backoff_delay;
            logger.debug(`Delaying execution of ${feed_url} by ${timeout}`);
            return delayExecution(timeout).then(() => {
                return _fetch_rss_json_retrying(feed_url, attempt + 1);
            });
        }

        // We reach here if unexpected error
        throw err;
    });
}

function _fetch_rss_page (feed, page, items, all_links, max_items, oldest_date) {
    let is_paginated = false;
    let feed_url;

    let feed_obj = feed;
    if (Array.isArray(feed)) {
        feed_obj = feed[0];
    }

    if (typeof feed_obj === 'function') {
        is_paginated = true;
        feed_url = feed_obj(page);
    } else {
        feed_url = feed_obj;
    }

    if (!feed_url) {
        return items;
    }

    logger.debug(`fetching RSS ${feed_url}`);
    return _fetch_rss_json_retrying(feed_url).then(feed_json => {
        const recent_enough_items = feed_json.items
              .filter(item => item.pubdate >= oldest_date);

        const limited_items = [];
        recent_enough_items.slice(0, max_items - items.length).forEach(item => {
            if (!all_links.has(item.link)) {
                limited_items.push(item);
                all_links.add(item.link);
            }
        });

        const new_items = items.concat(limited_items);

        // If we've run into articles which are too old, or we've hit the max
        // number of items, cease crawling
        const done_crawling = (feed_json.items.length === 0 ||
                               limited_items.length < feed_json.items.length);

        if ((typeof feed_obj !== 'function') && _is_wordpress_feed(feed_json)) {
            logger.debug('Wordpress feed found, adding pagination');
            is_paginated = true;
            const new_feed = _do_create_wordpress(feed_obj);
            if (Array.isArray(feed)) {
                feed.shift();
                feed = [new_feed].concat(feed);
            } else {
                feed = new_feed;
            }
        }

        const _continue = Array.isArray(feed) ||
              (!done_crawling && is_paginated);

        if (!_continue) {
            return new_items;
        }

        let new_page;
        if (done_crawling && is_paginated && Array.isArray(feed)) {
            feed.shift();
            new_page = 1;
        } else {
            if (is_paginated) {
                new_page = page + 1;
            } else if (Array.isArray(feed)) {
                feed.shift();
                new_page = 1;
            }
        }
        return _fetch_rss_page(feed, new_page, new_items, all_links, max_items, oldest_date);
    });
}

exports.fetch_rss_entries = fetch_rss_entries;

function _do_create_wordpress (feed) {
    return function (page_num) {
        return `${feed}?paged=${page_num}`;
    };
}

/**
 * A utility to create a pagination function for Wordpress-generated feeds,
 * since they are so common. Make sure to verify that your feed is generated by
 * Wordpress before using this!
 * @param {string|Array} feed - The URL of the RSS feed (first page), or an
 *   array of URLs of RSS feeds
 * @returns {function} - A paginator function that can be passed to
 *   {@link #utilrssfetch_rss_entries|util.rss.fetch_rss_entries}
 * @memberof util/rss
 */
function create_wordpress_paginator (feed) {
    if (Array.isArray(feed)) {
        return feed.map(uri => _do_create_wordpress(uri));
    }
    return _do_create_wordpress(feed);
}

exports.create_wordpress_paginator = create_wordpress_paginator;
