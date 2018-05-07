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

    // This checks canonical URI defaults to the download URI:
    'canonicalURI': 'https://www.example.com/download',
    'matchingLinks': ['https://www.example.com/download'],

    'title': 'Test Asset',
    'synopsis': 'Test Asset synopsis',
    'license': 'Proprietary',
    'tags': [],
    'lastModifiedDate': '2017-04-18T19:54:40.000Z',
    'revisionTag': '2017-04-18T19:54:40.000Z',
};

describe('VideoAsset', () => {
    it('can serialize out correctly', () => {
        const asset = new libingester.VideoAsset();
        const thumbnailAsset = new libingester.ImageAsset();
        asset.set_title('Test Asset');
        asset.set_synopsis('Test Asset synopsis');
        asset.set_thumbnail(thumbnailAsset);
        asset.set_license('Proprietary');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_download_uri('https://www.example.com/download');

        const hatchMetadata = asset.to_metadata();

        // Check that asset ID and thumbnail asset ID are passed through
        expect(hatchMetadata.assetID).to.equal(asset.asset_id);
        expect(hatchMetadata.thumbnail).to.equal(thumbnailAsset.asset_id);
        // Remove the ID metadata before checking the rest
        delete hatchMetadata.assetID;
        delete hatchMetadata.thumbnail;

        expect(hatchMetadata).to.deep.equal(expectedHatchMetadata);
    });

    it('can pass metadata to constructor and set metadata at once', () => {
        const metadata = {
            synopsis: 'Test Asset synopsis',
            license: 'Proprietary',
            download_uri: 'https://www.example.com/download',
        };

        const asset = new libingester.VideoAsset(metadata);

        const moreMetadata = {
            title: 'Test Asset',
            last_modified_date: new Date(1492545280000),
        };

        asset.set_metadata(moreMetadata);

        const hatchMetadata = asset.to_metadata();
        delete hatchMetadata.assetID;

        expect(hatchMetadata).to.deep.equal(expectedHatchMetadata);
    });
});
