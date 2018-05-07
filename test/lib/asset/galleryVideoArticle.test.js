'use strict';

const expect = require('chai').expect;
const proxyquire = require('proxyquire');

const verifier = require('../../../lib/asset/verifier');

const mockVerifier = {
    verify_metadata: () => {
        return null;
    },
    verify_manifest_entry: () => {
        return null;
    },
    VerificationError: verifier.VerificationError,
};

const libingester = proxyquire('../../../lib/index', {
    './asset/verifier': mockVerifier,
});

const expectedHatchMetadata = {
    'objectType': 'ArticleObject',
    'contentType': 'text/html',

    'canonicalURI': 'https://www.example.com/',
    'matchingLinks': ['https://www.example.com/'],

    'title': 'Test Asset',
    'license': 'Proprietary',
    'tags': [ 'some', 'tags', 'EknStaticTag' ],
    'synopsis': 'a long time ago...',
    'lastModifiedDate': '2017-04-18T19:54:40.000Z',
    'revisionTag': '2017-04-18T19:54:40.000Z',

    'authors': ['Coco'],
    'published': '2017-04-18T19:54:40.000Z',
};

describe('GalleryVideoArticle', () => {
    it('can serialize out correctly', () => {
        const asset = new libingester.GalleryVideoArticle();
        asset.set_title('Test Asset');
        asset.set_license('Proprietary');
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_synopsis('a long time ago...');
        asset.set_body('<h1>Word of the Day</h1>');
        asset.set_author('Coco');
        asset.set_date_published(new Date(1492545280000));
        asset.set_read_more_text('More!');
        asset.set_tags([ 'some', 'tags' ]);
        asset.set_main_video('https://www.example.com/video');
        asset.set_as_static_page();

        asset.render();

        const hatchMetadata = asset.to_metadata();

        delete hatchMetadata.assetID;

        expect(hatchMetadata.document).to.contain('<h1>Word of the Day</h1>');
        expect(hatchMetadata.document).to.contain('More!');
        // Match at least one CSS rule despite no custom SCSS
        expect(hatchMetadata.document).to.match(/<style(.|\n)*{(.|\n)*:(.|\n)*}(.|\n)*<\/style>/);
        delete hatchMetadata.document;

        expect(hatchMetadata).to.deep.eql(expectedHatchMetadata);
    });

    it('can pass metadata to constructor and set metadata at once', () => {
        const metadata = {
            title: 'Test Asset',
            tags: [ 'some', 'tags' ],
            synopsis: 'a long time ago...',
            canonical_uri: 'https://www.example.com/',
            license: 'Proprietary',
        };
        const asset = new libingester.GalleryVideoArticle(metadata);

        const moreMetadata = {
            last_modified_date: new Date(1492545280000),
            date_published: new Date(1492545280000),
            author: 'Coco',
            body: '<h1>Word of the Day</h1>',
            read_more_text: 'More!',
            main_video: 'https://www.example.com/video',
            as_static_page: true,
        };

        asset.set_metadata(moreMetadata);

        asset.render();

        const hatchMetadata = asset.to_metadata();
        delete hatchMetadata.assetID;
        delete hatchMetadata.document;

        expect(hatchMetadata).to.deep.eql(expectedHatchMetadata);
    });
});
