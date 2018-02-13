'use strict';

const fs = require('fs');
const expect = require('chai').expect;
const proxyquire = require('proxyquire');

const libingester = proxyquire('../../lib/index', {
    './verify': {
        verify_metadata: () => {},
        verify_manifest_entry: () => {},
    },
});

class MockAsset extends libingester.BaseAsset {
    fails_with_error(err) { this._err = err; }
    set_dependent_assets(dependents) { this._dependents = dependents; }
    get_dependent_assets() {
        if (this._dependents) {
            return this._dependents.map(asset => asset.asset_id);
        }

        return [];
    }
    _process() {
        if (this._err) {
            return Promise.reject(this._err);
        }

        return Promise.resolve();
    }
}

function rmrf (dir) {
    fs.readdirSync(dir).forEach(file => fs.unlinkSync(`${dir}/${file}`));
    fs.rmdirSync(dir);
}

function createAssets (n) {
    let result = [];
    for (let i=0; i<n; i++) {
        result.push(new MockAsset());
    }
    return result;
}

function readHatchManifest (hatch) {
    const manifestPath = `./${hatch.get_path()}/hatch_manifest.json`;
    return JSON.parse(fs.readFileSync(manifestPath));
}

describe('Hatch', function() {
    let hatch;

    afterEach(() => {
        if (fs.existsSync(hatch.get_path())) {
            rmrf(hatch.get_path());
        }
    });

    describe('required params', function() {
        it('can return path of hatch', function() {
            hatch = new libingester.Hatch("abcd", "en");
            expect(hatch.get_path()).to.match(/hatch_abcd_[0-9_]+/);
        });

        it('can return the name of hatch', function() {
            hatch = new libingester.Hatch("testing", "en");
            expect(hatch.get_name()).to.equal("testing");
        });

        it('can return the language of hatch', function() {
            hatch = new libingester.Hatch("abcd", "something");
            expect(hatch.get_language()).to.equal("something");
        });

        it('can be forced to use specific path', function() {
            hatch = new libingester.Hatch("abcd", "en", { path: "./foo_bar_baz" });
            expect(hatch.get_path()).to.match(/foo_bar_baz/);
        });

        it('requires name and lang parameters to instantiate', function() {
            expect(() => { new libingester.Hatch() }).to.throw();
            expect(() => { new libingester.Hatch("abcd") }).to.throw();
        });

        // XXX: This is to ensure that v2-converted ingesters know that they
        //      need to use the newer api.
        it('requires second param to be a string', function() {
            expect(() => { new libingester.Hatch("abcd", { foo: "bar" }) }).to.throw();
        });
    });

    describe('argv no-tgz option', function() {
        it('does not blow up when no-tgz arg is missing', function() {
            // Implicit non-exception
            hatch = new libingester.Hatch("aacd", "en", { argv: ["--tgz", "/some/path"] });
        });

        it('does not blow up when no-tgz arg is at the end', function() {
            // Implicit non-exception
            hatch = new libingester.Hatch("abad", "en", { argv: ["/blah", "--no-tgz"] });
        });

        it('does not blow up when no-tgz arg is at the end', function() {
            // Implicit non-exception
            hatch = new libingester.Hatch("abbd", "en", { argv: ["/blah", "--no-tgz"] });
        });

        it('does not skip tgz by default', function() {
            hatch = new libingester.Hatch("aaaa", "en", { argv: ["/blah"] });
            expect(hatch.is_exporting_tgz()).to.be.equal(true);

            return hatch.finish().then(() => {
                expect(fs.existsSync(`${hatch.get_path()}.tar.gz`)).to.be.equal(true);

                fs.unlinkSync(`${hatch.get_path()}/hatch_manifest.json`);
                fs.unlinkSync(`${hatch.get_path()}.tar.gz`);
            });
        });

        it('skip tgz if flag set', function() {
            hatch = new libingester.Hatch("abce", "en", { argv: ["/blah", "--no-tgz"] });
            expect(hatch.is_exporting_tgz()).to.be.equal(false);

            return hatch.finish().then(() => {
                expect(fs.existsSync(`${hatch.get_path()}.tar.gz`)).to.be.equal(false);

                fs.unlinkSync(`${hatch.get_path()}/hatch_manifest.json`);
            });
        });
    });

    describe('argv path option', function() {
        it('does not blow up when path arg is not there', function() {
            // Implicit non-exception
            hatch = new libingester.Hatch("abcd", "en", { argv: ["--foo", "/some/path"] });
        });

        it('can process path correctly from passed in argv', function() {
            hatch = new libingester.Hatch("abcd", "en", { argv: ["--path", "./hatch_foo"] });
            expect(hatch.get_path()).to.equal("./hatch_foo");
        });

        it('does not break if invalid arg position', function() {
            hatch = new libingester.Hatch("abcd", "en", { argv: ["foo", "--path"] });
            expect(hatch.get_path()).to.match(/hatch_abcd_[0-9_]+/);
        });

        it('creates the directory path if missing', function() {
            const targetDir = "./abcdefg";
            if (fs.existsSync(targetDir)) {
                fs.rmdirSync(targetDir);
            }

            expect(fs.existsSync(targetDir)).to.be.equal(false);

            hatch = new libingester.Hatch("abcd", "en", { argv: ["--path", targetDir] });
            expect(fs.lstatSync(targetDir).isDirectory()).to.be.equal(true);
        });

        it('does not break if directory is already there', function() {
            const targetDir = "./abcdefg2";
            if (fs.existsSync(targetDir)) {
                fs.rmdirSync(targetDir);
            }
            fs.mkdirSync(targetDir, 0o775);

            expect(fs.lstatSync(targetDir).isDirectory()).to.be.equal(true);

            hatch = new libingester.Hatch("abcd", "en", { argv: ["--path", targetDir] });
        });
    });

    describe('handles failed assets', () => {
        let expectedError;
        beforeEach(() => {
            hatch = new libingester.Hatch("abcd", "en", { argv: ["--no-tgz"] });
            expectedError = new Error('expected error');
            expectedError.stack = '';
        });

        it('fails if all assets failed', () => {
            const fails = new MockAsset();
            fails.fails_with_error(expectedError);
            hatch.save_asset(fails);

            return expectPromiseRejects(hatch.finish());
        });

        it('fails if more than 90% of assets failed', () => {
            const assets = createAssets(100);
            assets.slice(0, 91).forEach(asset =>
                asset.fails_with_error(expectedError));
            assets.forEach(asset => hatch.save_asset(asset));

            return expectPromiseRejects(hatch.finish());
        });

        it('passes if 90% or fewer assets failed', () => {
            const assets = createAssets(100);
            assets.slice(0, 90).forEach(asset =>
                asset.fails_with_error(expectedError));
            assets.forEach(asset => hatch.save_asset(asset));

            return hatch.finish();
        });

        it('removes failed assets from a successful hatch', () => {
            const fails = new MockAsset();
            fails.fails_with_error(expectedError);
            hatch.save_asset(fails);

            const succeeds = new MockAsset();
            hatch.save_asset(succeeds);

            return hatch.finish().then(() => {
                const manifest = readHatchManifest(hatch);
                const assetIDs = manifest.assets.map(asset => asset.asset_id);
                expect(assetIDs).to.deep.equal([
                     succeeds.asset_id,
                ]);
            });
        });

        it('fails an asset if one of its dependent assets fails', () => {
            const root = new MockAsset();
            const child = new MockAsset();
            child.fails_with_error(expectedError);
            root.set_dependent_assets([child]);

            // add a successful asset to prevent the hatch from failing
            const succeeds = new MockAsset();
            [root, child, succeeds].forEach(asset => hatch.save_asset(asset));

            return hatch.finish().then(() => {
                const manifest = readHatchManifest(hatch);
                const assetIDs = manifest.assets.map(asset => asset.asset_id);
                expect(assetIDs).to.deep.equal([
                     succeeds.asset_id,
                ]);
            });
        });

        it('fails dependent assets if their parent fails', () => {
            const root = new MockAsset();
            const child1 = new MockAsset();
            const child2 = new MockAsset();
            child1.fails_with_error(expectedError);
            root.set_dependent_assets([child1, child2]);

            // add a successful asset to prevent the hatch from failing
            const succeeds = new MockAsset();

            [root, child1, child2, succeeds].forEach(asset => hatch.save_asset(asset));

            return hatch.finish().then(() => {
                const manifest = readHatchManifest(hatch);
                const assetIDs = manifest.assets.map(asset => asset.asset_id);
                expect(assetIDs).to.deep.equal([
                     succeeds.asset_id,
                ]);
            });
        });
    });

    describe('builds hierarchy', () => {
        beforeEach(() => {
            hatch = new libingester.Hatch("abcd", "en", { argv: ["--no-tgz"] });
        });

        it('only assigns parent assets the "isToplevel" attribute', () => {
            const p1 = new MockAsset();
            const p2 = new MockAsset();
            const c1 = new MockAsset();
            const c2 = new MockAsset();
            const c3 = new MockAsset();

            p1.set_dependent_assets([c1, c2]);
            p2.set_dependent_assets([c3]);
            [p1, p2, c1, c2, c3].forEach(a => hatch.save_asset(a));

            return hatch.finish().then(() => {
                const manifest = readHatchManifest(hatch);
                expect(findAsset(manifest, p1).isToplevel).to.be.true;
                expect(findAsset(manifest, p2).isToplevel).to.be.true;

                expect(findAsset(manifest, c1).isToplevel).to.be.false;
                expect(findAsset(manifest, c2).isToplevel).to.be.false;
                expect(findAsset(manifest, c3).isToplevel).to.be.false;
            });
        });
    });
});

function findAsset (manifest, sought) {
    return manifest.assets.find(asset => sought.asset_id === asset.asset_id);
}

function expectPromiseRejects (p) {
    return p.then(() => {
        throw new Error(`Expected promise to reject, but it resolved!`);
    }, () => {});
}

describe('MockAsset', function() {
    it('can set tags', function() {
        const asset = new MockAsset();
        asset.set_tags(['some', 'tags']);
        const metadata = asset.to_metadata();
        expect(metadata['tags']).to.deep.equal(['some', 'tags']);
    });

    it('can set null synopsis', function() {
        const asset = new MockAsset();
        expect(() => { asset.set_synopsis(undefined) }).to.not.throw();
    });
});

describe('ImageAsset', function() {
    it('can serialize out correctly', function() {
        const asset = new libingester.ImageAsset();
        const thumbnail_asset = new libingester.ImageAsset();
        asset.set_title('Test Asset');
        asset.set_synopsis('Test Asset synopsis');
        asset.set_thumbnail(thumbnail_asset);
        asset.set_license('Proprietary');
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_image_data('image/jpeg', 'asdf');

        const metadata = asset.to_metadata();

        // Check that asset ID and thumbnail asset ID are passed through
        expect(metadata['assetID']).to.equal(asset.asset_id);
        expect(metadata['thumbnail']).to.equal(thumbnail_asset.asset_id);
        // Remove the ID fields before checking the rest
        delete metadata['assetID'];
        delete metadata['thumbnail'];

        expect(metadata).to.deep.equal({
            "objectType": 'ImageObject',
            "contentType": 'image/jpeg',

            "canonicalURI": 'https://www.example.com/',
            "matchingLinks": [ 'https://www.example.com/' ],

            "title": 'Test Asset',
            "synopsis": 'Test Asset synopsis',
            "license": 'Proprietary',
            "tags": [],
            "lastModifiedDate": '2017-04-18T19:54:40.000Z',
            "revisionTag": '2017-04-18T19:54:40.000Z',
        });

        const data = asset.to_data();
        expect(data).to.equal('asdf');
    });
});

describe('BlogArticle', function() {
    let asset;

    beforeEach(function() {
        asset = new libingester.BlogArticle();
        asset.set_title('Test Asset');
        asset.set_license('Proprietary');
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_synopsis('a long time ago...');
        asset.set_body('<h1>Word of the Day</h1>');
        asset.set_author('Coco');
        asset.set_date_published(new Date(1492545280000));
        asset.set_read_more_text('More!');
        asset.set_tags(['some', 'tags']);
        asset.set_as_static_page();
    });

    it('can serialize out correctly', function() {
        asset.render();

        const metadata = asset.to_metadata();

        delete metadata['assetID'];

        expect(metadata['document']).to.contain('<h1>Word of the Day</h1>');
        expect(metadata['document']).to.contain('More!');
        // Match at least one CSS rule despite no custom SCSS
        expect(metadata['document']).to.match(/<style(.|\n)*{(.|\n)*:(.|\n)*}(.|\n)*<\/style>/);
        delete metadata['document'];

        expect(metadata).to.deep.eql({
            "objectType": 'ArticleObject',
            "contentType": 'text/html',

            "canonicalURI": 'https://www.example.com/',
            "matchingLinks": [ 'https://www.example.com/' ],

            "title": 'Test Asset',
            "license": 'Proprietary',
            "tags": ["some", "tags", "EknStaticTag"],
            "synopsis": 'a long time ago...',
            "lastModifiedDate": '2017-04-18T19:54:40.000Z',
            "revisionTag": '2017-04-18T19:54:40.000Z',

            "authors": ['Coco'],
            "published": '2017-04-18T19:54:40.000Z',
        });
    });

    it('renders the custom stylesheet', function() {
        asset.set_custom_scss('@import "_default"; * { color:red; }');
        asset.render();

        const metadata = asset.to_metadata();
        // Regex handles how libsass might minify the rendered CSS
        expect(metadata['document']).to.match(/\*\s*{\s*color:\s*red;?\s*}/);
    });
    it('cleans newlines from synopsis', function() {
        asset.set_synopsis('This is a line.\nThis is the same line.\n');
        asset.render();
        const metadata = asset.to_metadata();
        expect(metadata['synopsis']).to.equal('This is a line. This is the same line.');
    });
});

describe('NewsAsset', function() {
    let asset;

    beforeEach(function () {
        asset = new libingester.NewsArticle();
        asset.set_title('Test Asset');
        asset.set_license('Proprietary');
        asset.set_canonical_uri('https://www.example.com/');
        asset.set_last_modified_date(new Date(1492545280000));
        asset.set_body('<h1>Word of the Day</h1>');
        asset.set_section("word_of_day");
        asset.set_synopsis('a long time ago...');
        asset.set_as_static_page();
        asset.set_authors(['Merriam', 'Webster']);
        asset.set_source('Dictionary');
        asset.set_date_published(new Date(1492545280000));
        asset.set_read_more_link('More!');
        asset.set_lede('<p>Exciting paragraph</p>');
    });

    it('can serialize out correctly', function() {
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
            "objectType": 'ArticleObject',
            "contentType": 'text/html',

            "canonicalURI": 'https://www.example.com/',
            "matchingLinks": [ 'https://www.example.com/' ],

            "title": 'Test Asset',
            "license": 'Proprietary',
            "tags": ["word_of_day", "EknStaticTag"],
            "synopsis": 'a long time ago...',
            "lastModifiedDate": '2017-04-18T19:54:40.000Z',
            "revisionTag": '2017-04-18T19:54:40.000Z',

            "authors": ['Merriam', 'Webster'],
            "sourceName": 'Dictionary',
            "published": '2017-04-18T19:54:40.000Z',
        });
    });

    it('renders the default stylesheet if no custom SCSS set', function () {
        asset.render();

        const metadata = asset.to_metadata();

        // Match at least one CSS rule despite no custom SCSS
        expect(metadata['document']).to.match(/<style(.|\n)*{(.|\n)*:(.|\n)*}(.|\n)*<\/style>/);
    });

    it('renders the custom SCSS', function () {
        asset.set_custom_scss('@import "_default"; * { color:red; }');
        asset.render();

        const metadata = asset.to_metadata();
        // Regex handles how libsass might minify the rendered CSS
        expect(metadata['document']).to.match(/\*\s*{\s*color:\s*red;?\s*}/);
    });

    it('cannot use set_tags', function() {
        expect(asset.set_tags).to.throw();
    });

});
