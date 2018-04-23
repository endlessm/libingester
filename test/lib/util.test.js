// eslint-disable-next-line no-nested-ternary
'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs');
const cheerio = require('cheerio');

const rewire = require('rewire');
const util = rewire('../../lib/util');
const libingester = require('../../lib/index');
const { jsonDateParser } = require('json-date-parser');

// 2018-04-07T01:51:06.010Z
const FAKE_NOW = 1523065866010;

const _RSS_JSON = fs.readFileSync(`${__dirname}/test_files/rss-feeds.json`);

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

describe('encode_uri', () => {
    it('encodes URIs correctly', () => {
        // Normal URIs aren't touched.
        expect(util.encode_uri(
            'https://en.wikipedia.org/wiki/Abraham_Lincoln')).to.equal(
            'https://en.wikipedia.org/wiki/Abraham_Lincoln');

        expect(util.encode_uri(
            'https://en.wikipedia.org/w/api.php?action=query&titles=Abraham_Lincoln')).to.equal(
            'https://en.wikipedia.org/w/api.php?action=query&titles=Abraham_Lincoln');

        // Percent-encoded URIs aren't touched.
        expect(util.encode_uri(
            'https://en.wikipedia.org/w/api.php?action=query&titles=Abraham%20Lincoln')).to.equal(
            'https://en.wikipedia.org/w/api.php?action=query&titles=Abraham%20Lincoln');

        // Unicode URIs are encoded properly.
        expect(util.encode_uri(
            'https://en.wikipedia.org/wiki/Merkle–Damgård_construction')).to.equal(
            'https://en.wikipedia.org/wiki/Merkle%E2%80%93Damg%C3%A5rd_construction');

        // Check that we punycode URIs.
        expect(util.encode_uri(
            'http://☃.com/foo.png')).to.equal(
            'http://xn--n3h.com/foo.png');

        // Ensure we can handle file:/// URIs and URIs with empty netlocs.
        expect(util.encode_uri('file:///foo/bar')).to.equal('file:///foo/bar');
        expect(util.encode_uri('file://./foo/bar')).to.equal('file://./foo/bar');
    });
});

describe('download_img', () => {
    it('throws an error if given a string', () => {
        expect(() => util.download_img('<img src="foo">')).to.throw();
    });

    it('can handle downloading a regular src image', () => {
        const imageTag = cheerio('<img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg">test</img>');
        const asset = util.download_img(imageTag, '');

        expect(asset.asset_id).is.not.null;
        expect(asset.asset_id).is.not.undefined;
        expect(asset.to_data()).is.not.null;
    });

    it('handles Cheerio "node" objects as well', () => {
        const html = `
<html>
    <img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg" />
    <img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg" />
    <img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg" />
</html>
            `;
        const $doc = cheerio.load(html);
        const $images = $doc('img');

        // eslint-disable-next-line array-callback-return
        $images.map(function () {
            // `this` refers to an internal Cheerio "node" object which
            // doesn't have most of the bells and whistles of a normal
            // Cheerio object, such as the `attr()` function
            util.download_img(this, '');
        });

        const $imageLinks = $doc('a');
        // eslint-disable-next-line array-callback-return
        $imageLinks.map(function () {
            const $imageLink = cheerio(this);
            expect($imageLink.length).to.equal(1);
            expect($imageLink.attr('data-soma-widget')).to.equal('ImageLink');
            expect($imageLink.find('img').length).to.equal(1);
        });
    });

    describe('lightbox wrapper', () => {
        it('wraps the image in a link', () => {
            const html = `
<html>
    <img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg" />
</html>
            `;
            const $doc = cheerio.load(html);
            const $image = $doc('img');
            util.download_img($image, '');

            const imageLink = $doc('a');
            expect(imageLink.length).to.equal(1);
            expect(imageLink.attr('data-soma-widget')).to.equal('ImageLink');
            expect($image.attr('data-soma-hint')).to.equal('ImportantImage');
            expect(imageLink.find('img').length).to.equal(1);
        });
    });

    describe('data urls', () => {
        it('can handle png urls correctly', () => {
            const imageUrlFile = fs.readFileSync(`${__dirname}/test_files/base64_encoded_image.png.txt`);
            const image = fs.readFileSync(`${__dirname}/test_files/base64_encoded_image.png`);
            const imageSha256Hash = 'e7f555cc474b1d12a52cb9b9fa012a3502e8a2d972e19d49a898629937ac13ca';

            // We want this as a string
            const imageUrl = imageUrlFile.toString();

            if (typeof imageUrl === 'undefined' || imageUrl.length <= 0 ||
                typeof image === 'undefined' || image.length <= 0) {
                throw new Error('Invalid data loaded from test image');
            }

            const imageTag = cheerio(`<img src=${imageUrl}>test</img>`);

            const asset = util.download_img(imageTag, 'a://b.com/c d.html');
            expect(asset.asset_id).is.not.null;
            expect(asset.asset_id).is.not.undefined;
            expect(asset.to_data()).to.deep.equal(image);

            const metadata = asset.to_metadata();
            expect(metadata.contentType).to.equal('image/png');
            expect(metadata.canonicalURI).to.equal('data:image/png;' +
                                                   'uri=a://b.com/c%20d.html;' +
                                                   `sha256=${imageSha256Hash};`);
        });

        it('can handle jpeg urls correctly', () => {
            const imageUrlFile = fs.readFileSync(`${__dirname}/test_files/base64_encoded_image.jpeg.txt`);
            const image = fs.readFileSync(`${__dirname}/test_files/base64_encoded_image.jpeg`);
            const imageSha256Hash = '1bc8db1d29ab4d12a8d4296de97ec0b26aa6f666a8e12bc9ff78016274120363';

            // We want this as a string
            const imageUrl = imageUrlFile.toString();

            if (typeof imageUrl === 'undefined' || imageUrl.length <= 0 ||
                typeof image === 'undefined' || image.length <= 0) {
                throw new Error('Invalid data loaded from test image');
            }

            const imageTag = cheerio(`<img src=${imageUrl}>test</img>`);

            const asset = util.download_img(imageTag, 'a://b.com/c d.html');
            expect(asset.asset_id).is.not.null;
            expect(asset.asset_id).is.not.undefined;
            expect(asset.to_data()).to.deep.equal(image);

            const metadata = asset.to_metadata();
            expect(metadata.contentType).to.equal('image/jpeg');
            expect(metadata.canonicalURI).to.equal('data:image/jpeg;' +
                                                   'uri=a://b.com/c%20d.html;' +
                                                   `sha256=${imageSha256Hash};`);
        });
    });
});

// FIXME these tests intermittently fail because they reach out to external
// servers. We should replace them with content served locally
describe('fetch_html', function () {
    const doctype = '<!DOCTYPE html>';
    this.timeout(5000);

    it('works', () => {
        const testUrl = 'https://creativecommons.org/blog';
        return util.fetch_html(testUrl).then(result => {
            expect(result.html().substring(0, doctype.length)).to.equal(doctype);
        });
    });

    it('can handle gzipped responses', () => {
        const testUrl = 'https://www.kapanlagi.com/' +
                        'intermezzone/' +
                        'bule-amerika-ini-nyoba-makan-buah-duku-ekspresinya-nggak-nahan-aee243.html';
        return util.fetch_html(testUrl).then(result => {
            expect(result.html().substring(0, doctype.length)).to.equal(doctype);
        });
    });
});

describe('get_embedded_video_asset', () => {
    it('works', () => {
        const articleHtml = fs.readFileSync(`${__dirname}/test_files/article_with_video.html`);
        const $ = cheerio.load(articleHtml);
        const iframeTag = $('iframe');
        const videoTag = $('video');

        const iframeAsset = util.get_embedded_video_asset(iframeTag, iframeTag.attr('src'));
        const videoAsset = util.get_embedded_video_asset(videoTag, videoTag.attr('src'));

        expect(iframeAsset).to.be.instanceOf(libingester.VideoAsset);
        expect(videoAsset).to.be.instanceOf(libingester.VideoAsset);

        expect($('iframe').length).to.equal(0);
        const videoLinkSelector = 'a[data-soma-widget="VideoLink"].media-link.video';
        expect($(videoLinkSelector).length).to.equal(2);

        const videoJobIds = $(videoLinkSelector).map((i, v) => {
            return v.attribs['data-libingester-asset-id'];
        }).get();

        expect(videoJobIds).to.deep.equal([ iframeAsset.asset_id, videoAsset.asset_id ]);
    });
});

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
        feedPaginated = util.create_wordpress_paginator('http://my-site.com/rss');
        feedWordpress = 'http://another.com/feed';
        feedArrayPaged = util.create_wordpress_paginator([ 'http://my-site.com/rss',
                                                           'http://another.com/feed' ]);
        feedArrayPaged2 = [ util.create_wordpress_paginator('http://my-site.com/rss'),
                            util.create_wordpress_paginator('http://another.com/feed') ];
        feedArrayMixed = [ 'http://simple-site.com/rss',
                           util.create_wordpress_paginator('http://another.com/feed') ];
        feedArrayMixedWordpress = [ 'http://simple-site.com/rss',
                                    'http://another.com/feed' ];

        const stubFetch = sinon.stub();

        FEED_PAGES.forEach(([ input, output ]) => {
            stubFetch.withArgs(input).resolves(output);
        });

        fetchRssRestore = util.__set__('_fetchRssJson', stubFetch);
    });
    afterEach(() => {
        fetchRssRestore();
        clock.restore();
    });
    it('works with default settings', () => {
        return util.fetch_rss_entries('http://simple-site.com/rss').then(items => {
            expect(items.length).to.equal(2);
            expect(items[0]).to.include.keys('link');
            expect(items[1]).to.include.keys('link');
        });
    });
    it('removes duplicated URLs', () => {
        return util.fetch_rss_entries('http://feed-with-dups').then(items => {
            expect(items.length).to.equal(2);
        });
    });
    it('can specify max days old', () => {
        return util.fetch_rss_entries('http://simple-site.com/rss', Infinity, 2).then(items => {
            expect(items.length).to.equal(3);
        });
    });
    it('can specify max items', () => {
        return util.fetch_rss_entries('http://simple-site.com/rss', 2).then(items => {
            expect(items.length).to.equal(2);
        });
    });
    it('can specify max items and max days old', () => {
        return util.fetch_rss_entries('http://simple-site.com/rss', 4, 2).then(items => {
            expect(items.length).to.equal(3);
        });
    });
    it('works with array, default settings', () => {
        return util.fetch_rss_entries(feedArray).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, array', () => {
        return util.fetch_rss_entries(feedArray, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can specify max items and max days old, array', () => {
        return util.fetch_rss_entries(feedArray, 4, 2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination', () => {
        return util.fetch_rss_entries(feedPaginated, Infinity, 100).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can specify max items, pagination', () => {
        return util.fetch_rss_entries(feedPaginated, 5, 365).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, pagination', () => {
        return util.fetch_rss_entries(feedPaginated, 100, 6).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can add pagination to arrays', () => {
        return util.fetch_rss_entries(feedArrayPaged).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination to items in arrays', () => {
        return util.fetch_rss_entries(feedArrayPaged2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can autodiscover wordpress pagination', () => {
        return util.fetch_rss_entries(feedWordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(6);
        });
    });
    it('can mix URIs and paginated in arrays', () => {
        return util.fetch_rss_entries(feedArrayMixed, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover wordpress', () => {
        return util.fetch_rss_entries(feedArrayMixedWordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover and specify max days old', () => {
        return util.fetch_rss_entries(feedArrayMixedWordpress, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can mix and autodiscover and specify max items', () => {
        return util.fetch_rss_entries(feedArrayMixedWordpress, 5, 2).then(items => {
            expect(items.length).to.equal(5);
        });
    });
});
