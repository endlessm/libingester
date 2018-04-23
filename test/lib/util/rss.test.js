// eslint-disable-next-line no-nested-ternary
'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs');
const rewire = require('rewire');
const { jsonDateParser } = require('json-date-parser');

const rss = rewire('../../../lib/util/rss');

// 2018-04-07T01:51:06.010Z
const FAKE_NOW = 1523065866010;

const _RSS_JSON = fs.readFileSync(`${__dirname}/../test_files/rss-feeds.json`);

const FEEDS = JSON.parse(_RSS_JSON, jsonDateParser);

const FEED_PAGES = [
    [ 'http://simple-site.com/rss', FEEDS.simple ],
    [ 'https://simple2.com/rss', FEEDS.simple_2 ],
    [ 'http://feed-with-dups', FEEDS.dups ],
    [ 'http://my-site.com/rss', FEEDS.A_page_1 ],
    [ 'http://my-site.com/rss?paged=1', FEEDS.A_page_1 ],
    [ 'http://my-site.com/rss?paged=2', FEEDS.A_page_2 ],
    [ 'http://my-site.com/rss?paged=3', FEEDS.A_page_3 ],
    [ 'http://my-site.com/rss?paged=4', FEEDS.A_page_4 ],
    [ 'http://another.com/feed', FEEDS.B_page_1 ],
    [ 'http://another.com/feed?paged=1', FEEDS.B_page_1 ],
    [ 'http://another.com/feed?paged=2', FEEDS.B_page_2 ],
    [ 'http://another.com/feed?paged=3', FEEDS.B_page_3 ],
];

describe('test_fetch_rss_entries', () => {
    let feedArray;
    let feedPaginated;
    let feedWordpress;
    let feedArrayPaged;
    let feedArrayPaged2;
    let feedArrayMixed;
    let feedArrayMixedWordpress;
    let fetchRssRestore;
    let clock;

    beforeEach(() => {
        clock = sinon.useFakeTimers(FAKE_NOW);
        feedArray = [ 'http://simple-site.com/rss', 'https://simple2.com/rss' ];
        feedPaginated = rss.create_wordpress_paginator('http://my-site.com/rss');
        feedWordpress = 'http://another.com/feed';
        feedArrayPaged = rss.create_wordpress_paginator([ 'http://my-site.com/rss',
                                                          'http://another.com/feed' ]);
        feedArrayPaged2 = [ rss.create_wordpress_paginator('http://my-site.com/rss'),
                            rss.create_wordpress_paginator('http://another.com/feed') ];
        feedArrayMixed = [ 'http://simple-site.com/rss',
                           rss.create_wordpress_paginator('http://another.com/feed') ];
        feedArrayMixedWordpress = [ 'http://simple-site.com/rss',
                                    'http://another.com/feed' ];

        const stubFetch = sinon.stub();

        FEED_PAGES.forEach(([ input, output ]) => {
            stubFetch.withArgs(input).resolves(output);
        });

        fetchRssRestore = rss.__set__('_fetchRssJson', stubFetch);
    });
    afterEach(() => {
        fetchRssRestore();
        clock.restore();
    });
    it('works with default settings', () => {
        return rss.fetch_rss_entries('http://simple-site.com/rss').then(items => {
            expect(items.length).to.equal(2);
            expect(items[0]).to.include.keys('link');
            expect(items[1]).to.include.keys('link');
        });
    });
    it('removes duplicated URLs', () => {
        return rss.fetch_rss_entries('http://feed-with-dups').then(items => {
            expect(items.length).to.equal(2);
        });
    });
    it('can specify max days old', () => {
        return rss.fetch_rss_entries('http://simple-site.com/rss', Infinity, 2).then(items => {
            expect(items.length).to.equal(3);
        });
    });
    it('can specify max items', () => {
        return rss.fetch_rss_entries('http://simple-site.com/rss', 2).then(items => {
            expect(items.length).to.equal(2);
        });
    });
    it('can specify max items and max days old', () => {
        return rss.fetch_rss_entries('http://simple-site.com/rss', 4, 2).then(items => {
            expect(items.length).to.equal(3);
        });
    });
    it('works with array, default settings', () => {
        return rss.fetch_rss_entries(feedArray).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, array', () => {
        return rss.fetch_rss_entries(feedArray, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can specify max items and max days old, array', () => {
        return rss.fetch_rss_entries(feedArray, 4, 2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination', () => {
        return rss.fetch_rss_entries(feedPaginated, Infinity, 100).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can specify max items, pagination', () => {
        return rss.fetch_rss_entries(feedPaginated, 5, 365).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, pagination', () => {
        return rss.fetch_rss_entries(feedPaginated, 100, 6).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can add pagination to arrays', () => {
        return rss.fetch_rss_entries(feedArrayPaged).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination to items in arrays', () => {
        return rss.fetch_rss_entries(feedArrayPaged2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can autodiscover wordpress pagination', () => {
        return rss.fetch_rss_entries(feedWordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(6);
        });
    });
    it('can mix URIs and paginated in arrays', () => {
        return rss.fetch_rss_entries(feedArrayMixed, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover wordpress', () => {
        return rss.fetch_rss_entries(feedArrayMixedWordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover and specify max days old', () => {
        return rss.fetch_rss_entries(feedArrayMixedWordpress, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can mix and autodiscover and specify max items', () => {
        return rss.fetch_rss_entries(feedArrayMixedWordpress, 5, 2).then(items => {
            expect(items.length).to.equal(5);
        });
    });
});
