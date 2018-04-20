'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const sinon = require('sinon');
const rewire = require('rewire');
const rss = rewire('../../../lib/util/rss');
const { jsonDateParser } = require('json-date-parser');

const FAKE_NOW = 1523065866010;  // 2018-04-07T01:51:06.010Z

const _RSS_JSON = fs.readFileSync(__dirname + '/../test_files/rss-feeds.json');

const FEEDS = JSON.parse(_RSS_JSON, jsonDateParser);

const FEED_PAGES = [
    ['http://simple-site.com/rss', FEEDS['simple']],
    ['https://simple2.com/rss', FEEDS['simple_2']],
    ['http://feed-with-dups', FEEDS['dups']],
    ['http://my-site.com/rss', FEEDS['A_page_1']],
    ['http://my-site.com/rss?paged=1', FEEDS['A_page_1']],
    ['http://my-site.com/rss?paged=2', FEEDS['A_page_2']],
    ['http://my-site.com/rss?paged=3', FEEDS['A_page_3']],
    ['http://my-site.com/rss?paged=4', FEEDS['A_page_4']],
    ['http://another.com/feed', FEEDS['B_page_1']],
    ['http://another.com/feed?paged=1', FEEDS['B_page_1']],
    ['http://another.com/feed?paged=2', FEEDS['B_page_2']],
    ['http://another.com/feed?paged=3', FEEDS['B_page_3']],
];

describe('test_fetch_rss_entries', () => {
    let feed_array;
    let feed_paginated;
    let feed_wordpress;
    let feed_array_paged;
    let feed_array_paged2;
    let feed_array_mixed;
    let feed_array_mixed_wordpress;
    let fetch_rss_restore;
    let clock;

    beforeEach(function() {
        clock = sinon.useFakeTimers(FAKE_NOW);
        feed_array = ['http://simple-site.com/rss', 'https://simple2.com/rss'];
        feed_paginated = rss.create_wordpress_paginator('http://my-site.com/rss');
        feed_wordpress = 'http://another.com/feed';
        feed_array_paged = rss.create_wordpress_paginator(['http://my-site.com/rss',
                                                            'http://another.com/feed']);
        feed_array_paged2 = [rss.create_wordpress_paginator('http://my-site.com/rss'),
                             rss.create_wordpress_paginator('http://another.com/feed')];
        feed_array_mixed = ['http://simple-site.com/rss',
                            rss.create_wordpress_paginator('http://another.com/feed')];
        feed_array_mixed_wordpress = ['http://simple-site.com/rss',
                                      'http://another.com/feed'];

        const stub_fetch =  sinon.stub();

        FEED_PAGES.forEach(([input, output]) => {
            stub_fetch.withArgs(input).resolves(output);
        });

        fetch_rss_restore = rss.__set__('_fetch_rss_json', stub_fetch);
    });
    afterEach(() => {
        fetch_rss_restore();
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
        return rss.fetch_rss_entries(feed_array).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, array', () => {
        return rss.fetch_rss_entries(feed_array, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can specify max items and max days old, array', () => {
        return rss.fetch_rss_entries(feed_array, 4, 2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination', () => {
        return rss.fetch_rss_entries(feed_paginated, Infinity, 100).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can specify max items, pagination', () => {
        return rss.fetch_rss_entries(feed_paginated, 5, 365).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, pagination', () => {
        return rss.fetch_rss_entries(feed_paginated, 100, 6).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can add pagination to arrays', () => {
        return rss.fetch_rss_entries(feed_array_paged).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination to items in arrays', () => {
        return rss.fetch_rss_entries(feed_array_paged2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can autodiscover wordpress pagination', () => {
        return rss.fetch_rss_entries(feed_wordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(6);
        });
    });
    it('can mix URIs and paginated in arrays', () => {
        return rss.fetch_rss_entries(feed_array_mixed, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover wordpress', () => {
        return rss.fetch_rss_entries(feed_array_mixed_wordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover and specify max days old', () => {
        return rss.fetch_rss_entries(feed_array_mixed_wordpress, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can mix and autodiscover and specify max items', () => {
        return rss.fetch_rss_entries(feed_array_mixed_wordpress, 5, 2).then(items => {
            expect(items.length).to.equal(5);
        });
    });
});
