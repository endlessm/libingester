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
    'objectType': 'VideoObject',
    // eslint-disable-next-line no-undefined
    'contentType': undefined,

    'canonicalURI': 'https://www.example.com/',
    'matchingLinks': ['https://www.example.com/'],

    'title': 'Test Asset',
    'license': 'Proprietary',
    'tags': [ 'some', 'tags' ],
    'synopsis': 'a long time ago...',
    'lastModifiedDate': '2017-04-18T19:54:40.000Z',
    'revisionTag': '2017-04-18T19:54:40.000Z',

    'authors': ['Coco'],
    'published': '2017-04-18T19:54:40.000Z',
};

describe('VideoArticle', () => {
    it('can serialize out correctly', () => {
        const asset = new libingester.VideoArticle();
        asset.set_title('Test Asset');
        asset.set_license('Proprietary');
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_synopsis('a long time ago...');
        asset.set_author('Coco');
        asset.set_date_published(new Date(1492545280000));
        asset.set_tags([ 'some', 'tags' ]);

        const hatchMetadata = asset.to_hatch_metadata();

        delete hatchMetadata.assetID;

        expect(hatchMetadata).to.deep.equal(expectedHatchMetadata);
    });

    it('can pass metadata to constructor and set metadata at once', () => {
        const metadata = {
            title: 'Test Asset',
            tags: [ 'some', 'tags' ],
            synopsis: 'a long time ago...',
            canonical_uri: 'https://www.example.com/',
            license: 'Proprietary',
        };
        const asset = new libingester.VideoArticle(metadata);

        const moreMetadata = {
            last_modified_date: new Date(1492545280000),
            date_published: new Date(1492545280000),
            author: 'Coco',
        };

        asset.set_metadata(moreMetadata);

        const hatchMetadata = asset.to_hatch_metadata();
        delete hatchMetadata.assetID;
        delete hatchMetadata.document;

        expect(hatchMetadata).to.deep.eql(expectedHatchMetadata);
    });
});
