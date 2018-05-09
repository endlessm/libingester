// eslint-disable-next-line no-nested-ternary
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
    'objectType': 'ImageObject',
    'contentType': 'image/jpeg',

    'canonicalURI': 'https://www.example.com/',
    'matchingLinks': ['https://www.example.com/'],

    'title': 'Test Asset',
    'synopsis': 'Test Asset synopsis',
    'license': 'Proprietary',
    'tags': [],
    'lastModifiedDate': '2017-04-18T19:54:40.000Z',
    'revisionTag': '2017-04-18T19:54:40.000Z',
};

describe('ImageAsset', () => {
    it('can serialize out correctly', () => {
        const asset = new libingester.ImageAsset();
        const thumbnailAsset = new libingester.ImageAsset();
        asset.set_title('Test Asset');
        asset.set_synopsis('Test Asset synopsis');
        asset.set_thumbnail(thumbnailAsset);
        asset.set_license('Proprietary');
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_image_data('image/jpeg', 'asdf');

        const hatchMetadata = asset.to_hatch_metadata();

        // Check that asset ID and thumbnail asset ID are passed through
        expect(hatchMetadata.assetID).to.equal(asset.asset_id);
        expect(hatchMetadata.thumbnail).to.equal(thumbnailAsset.asset_id);
        // Remove the ID metadata before checking the rest
        delete hatchMetadata.assetID;
        delete hatchMetadata.thumbnail;

        expect(hatchMetadata).to.deep.equal(expectedHatchMetadata);

        const data = asset.to_data();
        expect(data).to.equal('asdf');
    });

    it('can pass metadata to constructor and set metadata at once', () => {
        const metadata = {
            synopsis: 'Test Asset synopsis',
            license: 'Proprietary',
            canonical_uri: 'https://www.example.com/',
            last_modified_date: new Date(1492545280000),
        };

        const asset = new libingester.ImageAsset(metadata);

        const moreMetadata = {
            title: 'Test Asset',
            image_data: {
                content_type: 'image/jpeg',
                image_data: 'asdf',
            },
        };

        asset.set_metadata(moreMetadata);

        const hatchMetadata = asset.to_hatch_metadata();
        delete hatchMetadata.assetID;

        expect(hatchMetadata).to.deep.equal(expectedHatchMetadata);

        const data = asset.to_data();
        expect(data).to.equal('asdf');
    });
});
