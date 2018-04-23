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

        const metadata = asset.to_metadata();

        // Check that asset ID and thumbnail asset ID are passed through
        expect(metadata.assetID).to.equal(asset.asset_id);
        expect(metadata.thumbnail).to.equal(thumbnailAsset.asset_id);
        // Remove the ID fields before checking the rest
        delete metadata.assetID;
        delete metadata.thumbnail;

        expect(metadata).to.deep.equal({
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
        });

        const data = asset.to_data();
        expect(data).to.equal('asdf');
    });
});
