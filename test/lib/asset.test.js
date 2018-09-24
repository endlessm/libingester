'use strict';

const libingester = require('../../');

function testKeys (obj, keys) {
    expect(Object.keys(obj).sort()).toEqual(keys.sort());
}

describe('can sanitize assets', () => {
    let asset;

    beforeAll(() => {
        // FIXME needed to initialize config and logger
        // eslint-disable-next-line no-new
        new libingester.WebIngester();
    });

    beforeEach(() => {
        asset = new libingester.Asset('https://example.com/my-article/');
    });

    test('can sanitize text metadata', () => {
        asset.setMetadata('title', '  My Title\n');
        expect(asset.metadata.title).toBe('My Title');
    });

    test('can sanitize array metadata', () => {
        asset.addMetadataValue('tags', '  My-Tag');
        expect(asset.metadata.tags).toEqual(['My-Tag']);
    });
});

describe('can validate assets', () => {
    let asset;

    beforeAll(() => {
        // FIXME needed to initialize config and logger
        // eslint-disable-next-line no-new
        new libingester.WebIngester();
    });

    beforeEach(() => {
        asset = new libingester.Asset('https://example.com/my-article/');
        asset.setMetadata({
            'objectType': libingester.Asset.ARTICLE_OBJECT_TYPE,
            'title': 'My Article',
            'contentType': 'text/html',
        });
    });

    test('validates by default', () => {
        expect(asset.validate()).toBe(null);
    });

    test('checks mandatory metadata', () => {
        asset.setMetadata('canonicalURI', null);
        asset.setMetadata('title', null);
        const errors = asset.validate();
        testKeys(errors, ['canonicalURI', 'matchingLinks', 'title']);
    });

    test('canonicalURI must be an URI', () => {
        asset.setMetadata('canonicalURI', 'not-an-uri');
        const errors = asset.validate();
        testKeys(errors, ['canonicalURI', 'matchingLinks']);
    });

    test('checks long title', () => {
        const longTitle = (new Array(100)).join('hello ');
        asset.setMetadata('title', longTitle);
        const errors = asset.validate();
        testKeys(errors, ['title']);
    });

    test('checks contentType', () => {
        asset.setMetadata('contentType', 'not-a-content-type');
        const errors = asset.validate();
        testKeys(errors, ['contentType']);
    });

    test('can add custom failures', () => {
        asset.addCustomFailure('Something went wrong');
        const errors = asset.validate();
        expect(errors).toEqual({ 'custom': ['Something went wrong'] });
    });

    test('can report multiple errors', () => {
        asset.setMetadata('canonicalURI', 'not-an-uri');
        asset.addCustomFailure('Something went wrong');
        asset.addCustomFailure('Something went very wrong');
        const errors = asset.validate();
        testKeys(errors, ['canonicalURI', 'custom', 'matchingLinks']);
        expect(errors['canonicalURI'].length).toEqual(1);
        expect(errors['custom'].length).toEqual(2);
    });
});

describe('can tell if a tree of assets is valid', () => {
    let asset;
    let mainImage;
    let video;
    let videoThumb;

    beforeAll(() => {
        // FIXME needed to initialize config and logger
        // eslint-disable-next-line no-new
        new libingester.WebIngester();
    });

    beforeEach(() => {
        asset = new libingester.Asset('https://example.com/my-article/');
        asset.setMetadata({
            'objectType': libingester.Asset.ARTICLE_OBJECT_TYPE,
            'title': 'My Article',
            'contentType': 'text/html',
        });
        mainImage = new libingester.Asset('https://example.com/my-article.png');
        mainImage.setMetadata({
            'objectType': libingester.Asset.IMAGE_OBJECT_TYPE,
            'contentType': 'image/png',
        });
        asset.children.push(mainImage);
        video = new libingester.Asset('https://videos.example.com/my-video');
        video.setMetadata({
            'objectType': libingester.Asset.VIDEO_OBJECT_TYPE,
            'contentType': 'video/mp4',
        });
        asset.children.push(video);
        videoThumb = new libingester.Asset('https://videos.example.com/my-video.jpg');
        videoThumb.setMetadata({
            'objectType': libingester.Asset.IMAGE_OBJECT_TYPE,
            'contentType': 'image/jpeg',
        });
        video.children.push(videoThumb);
    });

    test('is valid by default', () => {
        expect(asset.isValidTree()).toBe(true);
    });

    test('fails if an immediate children fails', () => {
        mainImage.addCustomFailure('Something went wrong');
        expect(asset.isValidTree()).toBe(false);
    });

    test('fails if any children fails', () => {
        videoThumb.addCustomFailure('Something went wrong');
        expect(asset.isValidTree()).toBe(false);
    });
});
