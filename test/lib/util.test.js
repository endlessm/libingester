'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs');
const cheerio = require('cheerio');

const rewire = require('rewire');
const util = rewire('../../lib/util');
const libingester = require('../../lib/index');
const { jsonDateParser } = require('json-date-parser');

const FAKE_NOW = 1523065866010;  // 2018-04-07T01:51:06.010Z

const _RSS_JSON = fs.readFileSync(__dirname + '/test_files/rss-feeds.json');

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

describe('encode_uri', function() {
    it('encodes URIs correctly', function() {
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

describe('download_img', function() {
    it('throws an error if given a string', function (){
        expect(() => util.download_img('<img src="foo">')).to.throw();
    });

    it('can handle downloading a regular src image', function() {
        let imageTag = cheerio("<img src=\"https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg\">test</img>");

        const asset = util.download_img(imageTag, '');
        expect(asset.asset_id).is.not.null;
        expect(asset.asset_id).is.not.undefined;
        expect(asset.to_data()).is.not.null;
    });

    it('handles Cheerio "node" objects as well', function() {
            const html = `
<html>
    <img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg" />
    <img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg" />
    <img src="https://endlessos.com/wp-content/uploads/2016/05/Home_Video@2x.jpg" />
</html>
            `;
            const $doc = cheerio.load(html);
            const $images = $doc('img');
            $images.map(function() {
                // `this` refers to an internal Cheerio "node" object which
                // doesn't have most of the bells and whistles of a normal
                // Cheerio object, such as the `attr()` function
                util.download_img(this, '');
            });

            const $imageLinks = $doc('a');
            $imageLinks.map(function() {
                const $imageLink = cheerio(this);
                expect($imageLink.length).to.equal(1);
                expect($imageLink.attr('data-soma-widget')).to.equal('ImageLink');
                expect($imageLink.find('img').length).to.equal(1);
            });
    });

    describe('lightbox wrapper', function() {
        it('wraps the image in a link', function() {
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

    describe('data urls', function() {
        it('can handle png urls correctly', function() {
            const imageUrlFile = fs.readFileSync(__dirname + '/test_files/base64_encoded_image.png.txt');
            const image = fs.readFileSync(__dirname + '/test_files/base64_encoded_image.png');
            const imageSha256Hash = 'e7f555cc474b1d12a52cb9b9fa012a3502e8a2d972e19d49a898629937ac13ca';

            // We want this as a string
            let imageUrl = imageUrlFile.toString();

            if (imageUrl === undefined || imageUrl.length <= 0 ||
                image === undefined || image.length <= 0) {
              throw new Error("Invalid data loaded from test image");
            }

            const imageTag = cheerio("<img src=" + imageUrl + ">test</img>");

            const asset = util.download_img(imageTag, 'a://b.com/c d.html');
            expect(asset.asset_id).is.not.null;
            expect(asset.asset_id).is.not.undefined;
            expect(asset.to_data()).to.deep.equal(image);

            const metadata = asset.to_metadata();
            expect(metadata.contentType).to.equal('image/png');
            expect(metadata.canonicalURI).to.equal("data:image/png;" +
                                                   "uri=a://b.com/c%20d.html;" +
                                                   `sha256=${imageSha256Hash};`);
        });

        it('can handle jpeg urls correctly', function() {
            const imageUrlFile = fs.readFileSync(__dirname + '/test_files/base64_encoded_image.jpeg.txt');
            const image = fs.readFileSync(__dirname + '/test_files/base64_encoded_image.jpeg');
            const imageSha256Hash = '1bc8db1d29ab4d12a8d4296de97ec0b26aa6f666a8e12bc9ff78016274120363';

            // We want this as a string
            let imageUrl = imageUrlFile.toString();

            if (imageUrl === undefined || imageUrl.length <= 0 ||
                image === undefined || image.length <= 0) {
              throw new Error("Invalid data loaded from test image");
            }

            const imageTag = cheerio("<img src=" + imageUrl + ">test</img>");

            const asset = util.download_img(imageTag, 'a://b.com/c d.html');
            expect(asset.asset_id).is.not.null;
            expect(asset.asset_id).is.not.undefined;
            expect(asset.to_data()).to.deep.equal(image);

            const metadata = asset.to_metadata();
            expect(metadata.contentType).to.equal('image/jpeg');
            expect(metadata.canonicalURI).to.equal("data:image/jpeg;" +
                                                   "uri=a://b.com/c%20d.html;" +
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
        const test_url = 'https://creativecommons.org/blog';
        return util.fetch_html(test_url).then(result => {
            expect(result.html().substring(0, doctype.length)).to.equal(doctype);
        });
    });

    it('can handle gzipped responses', () => {
        const test_url = 'https://www.kapanlagi.com/' +
                        'intermezzone/' +
                        'bule-amerika-ini-nyoba-makan-buah-duku-ekspresinya-nggak-nahan-aee243.html';
        return util.fetch_html(test_url).then((result) => {
            expect(result.html().substring(0, doctype.length)).to.equal(doctype);
        });
    });
});

describe('get_embedded_video_asset', () => {
    it('works', () => {
        const articleHtml = fs.readFileSync(__dirname + '/test_files/article_with_video.html');
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

        const video_job_ids = $(videoLinkSelector).map((i, v) => v.attribs['data-libingester-asset-id']).get();
        expect(video_job_ids).to.deep.equal([iframeAsset.asset_id, videoAsset.asset_id]);
    });
});

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
        feed_paginated = util.create_wordpress_paginator('http://my-site.com/rss');
        feed_wordpress = 'http://another.com/feed';
        feed_array_paged = util.create_wordpress_paginator(['http://my-site.com/rss',
                                                            'http://another.com/feed']);
        feed_array_paged2 = [util.create_wordpress_paginator('http://my-site.com/rss'),
                             util.create_wordpress_paginator('http://another.com/feed')];
        feed_array_mixed = ['http://simple-site.com/rss',
                            util.create_wordpress_paginator('http://another.com/feed')];
        feed_array_mixed_wordpress = ['http://simple-site.com/rss',
                                      'http://another.com/feed'];

        const stub_fetch =  sinon.stub();

        FEED_PAGES.forEach(([input, output]) => {
            stub_fetch.withArgs(input).resolves(output);
        });

        fetch_rss_restore = util.__set__('_fetch_rss_json', stub_fetch);
    });
    afterEach(() => {
        fetch_rss_restore();
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
        return util.fetch_rss_entries(feed_array).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, array', () => {
        return util.fetch_rss_entries(feed_array, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can specify max items and max days old, array', () => {
        return util.fetch_rss_entries(feed_array, 4, 2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination', () => {
        return util.fetch_rss_entries(feed_paginated, Infinity, 100).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can specify max items, pagination', () => {
        return util.fetch_rss_entries(feed_paginated, 5, 365).then(items => {
            expect(items.length).to.equal(5);
        });
    });
    it('can specify max days old, pagination', () => {
        return util.fetch_rss_entries(feed_paginated, 100, 6).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can add pagination to arrays', () => {
        return util.fetch_rss_entries(feed_array_paged).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can add pagination to items in arrays', () => {
        return util.fetch_rss_entries(feed_array_paged2).then(items => {
            expect(items.length).to.equal(4);
        });
    });
    it('can autodiscover wordpress pagination', () => {
        return util.fetch_rss_entries(feed_wordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(6);
        });
    });
    it('can mix URIs and paginated in arrays', () => {
        return util.fetch_rss_entries(feed_array_mixed, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover wordpress', () => {
        return util.fetch_rss_entries(feed_array_mixed_wordpress, Infinity, 365).then(items => {
            expect(items.length).to.equal(10);
        });
    });
    it('can mix and autodiscover and specify max days old', () => {
        return util.fetch_rss_entries(feed_array_mixed_wordpress, Infinity, 2).then(items => {
            expect(items.length).to.equal(7);
        });
    });
    it('can mix and autodiscover and specify max items', () => {
        return util.fetch_rss_entries(feed_array_mixed_wordpress, 5, 2).then(items => {
            expect(items.length).to.equal(5);
        });
    });
});
