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
    'contentType': 'application/pdf',

    'canonicalURI': 'https://www.example.com/',
    'matchingLinks': ['https://www.example.com/'],

    'title': 'Test Asset',
    'synopsis': 'Test Asset synopsis',
    'license': 'Proprietary',
    'canExport': false,
    'canPrint': true,
    'tags': [],
    'lastModifiedDate': '2017-04-18T19:54:40.000Z',
    'revisionTag': '2017-04-18T19:54:40.000Z',
};

describe('DocumentAsset', () => {
    it('can serialize out correctly', () => {
        const asset = new libingester.DocumentAsset();
        const thumbnailAsset = new libingester.DocumentAsset();
        asset.set_title('Test Asset');
        asset.set_synopsis('Test Asset synopsis');
        asset.set_thumbnail(thumbnailAsset);
        asset.set_license('Proprietary');
        asset.set_can_export(false);
        asset.set_can_print(true);
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_document_data('application/pdf', 'qwerty');

        const hatchMetadata = asset.to_hatch_metadata();

        // Check that asset ID and thumbnail asset ID are passed through
        expect(hatchMetadata.assetID).to.equal(asset.asset_id);
        expect(hatchMetadata.thumbnail).to.equal(thumbnailAsset.asset_id);
        // Remove the ID metadata before checking the rest
        delete hatchMetadata.assetID;
        delete hatchMetadata.thumbnail;

        expect(hatchMetadata).to.deep.equal(expectedHatchMetadata);

        const data = asset.to_data();
        expect(data).to.equal('qwerty');
    });

    it('can pass metadata to constructor and set metadata at once', () => {
        const metadata = {
            synopsis: 'Test Asset synopsis',
            license: 'Proprietary',
            can_export: false,
            can_print: true,
            canonical_uri: 'https://www.example.com/',
            last_modified_date: new Date(1492545280000),
        };

        const asset = new libingester.DocumentAsset(metadata);

        const moreMetadata = {
            title: 'Test Asset',
            document_data: {
                content_type: 'application/pdf',
                document_data: 'qwerty',
            },
        };

        asset.set_metadata(moreMetadata);

        const hatchMetadata = asset.to_hatch_metadata();
        delete hatchMetadata.assetID;

        expect(hatchMetadata).to.deep.equal(expectedHatchMetadata);

        const data = asset.to_data();
        expect(data).to.equal('qwerty');
    });
});
