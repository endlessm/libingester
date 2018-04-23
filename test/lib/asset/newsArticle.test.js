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

describe('NewsArticle', () => {
    let asset;

    beforeEach(() => {
        asset = new libingester.NewsArticle();
        asset.set_title('Test Asset');
        asset.set_license('Proprietary');
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_body('<h1>Word of the Day</h1>');
        asset.set_section('word_of_day');
        asset.set_synopsis('a long time ago...');
        asset.set_as_static_page();
        asset.set_authors([ 'Merriam', 'Webster' ]);
        asset.set_source('Dictionary');
        asset.set_date_published(new Date(1492545280000));
        asset.set_read_more_link('More!');
        asset.set_lede('<p>Exciting paragraph</p>');
    });

    it('can serialize out correctly', () => {
        asset.render();

        const metadata = asset.to_metadata();

        // Remove randomness -- should probably be a mock if I can
        // figure out how to use it.
        delete metadata['assetID'];

        expect(metadata['document']).to.contain('<h1>Word of the Day</h1>');
        expect(metadata['document']).to.contain('More!');
        expect(metadata['document']).to.contain('<p>Exciting paragraph</p>');
        delete metadata['document'];

        expect(metadata).to.deep.eql({
            'objectType': 'ArticleObject',
            'contentType': 'text/html',

            'canonicalURI': 'https://www.example.com/',
            'matchingLinks': ['https://www.example.com/'],

            'title': 'Test Asset',
            'license': 'Proprietary',
            'tags': [ 'word_of_day', 'EknStaticTag' ],
            'synopsis': 'a long time ago...',
            'lastModifiedDate': '2017-04-18T19:54:40.000Z',
            'revisionTag': '2017-04-18T19:54:40.000Z',

            'authors': [ 'Merriam', 'Webster' ],
            'sourceName': 'Dictionary',
            'published': '2017-04-18T19:54:40.000Z',
        });
    });

    it('renders the default stylesheet if no custom SCSS set', () => {
        asset.render();

        const metadata = asset.to_metadata();

        // Match at least one CSS rule despite no custom SCSS
        expect(metadata['document']).to.match(/<style(.|\n)*{(.|\n)*:(.|\n)*}(.|\n)*<\/style>/);
    });

    it('renders the custom SCSS', () => {
        asset.set_custom_scss('@import "_default"; * { color:red; }');
        asset.render();

        const metadata = asset.to_metadata();
        // Regex handles how libsass might minify the rendered CSS
        expect(metadata['document']).to.match(/\*\s*{\s*color:\s*red;?\s*}/);
    });

    it('cannot use set_tags', () => {
        expect(asset.set_tags).to.throw();
    });
});
