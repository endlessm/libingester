// eslint-disable-next-line no-nested-ternary
'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const proxyquire = require('proxyquire');


const BaseAsset = require('../../lib/asset/baseAsset');
const config = require('../../lib/config');

const verifier = require('../../lib/asset/verifier');

const mockVerifier = {
    verify_metadata: () => {
        return null;
    },
    verify_manifest_entry: () => {
        return null;
    },
    VerificationError: verifier.VerificationError,
};

const libingester = proxyquire('../../lib/index', {
    './asset/verifier': mockVerifier,
});

class MockAsset extends BaseAsset {
    constructor() {
        super(mockVerifier);
    }

    fails_with_error(err) {
        this._err = err;
    }

    set_dependent_assets(dependents) {
        this._dependents = dependents;
    }

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

function rmrf(dir) {
    fs.readdirSync(dir).forEach(file => fs.unlinkSync(`${dir}/${file}`));
    fs.rmdirSync(dir);
}

function createAssets(n) {
    const result = [];
    for (let i = 0; i < n; i++) {
        result.push(new MockAsset());
    }
    return result;
}

function readHatchManifest(hatch) {
    const manifestPath = `./${hatch.get_path()}/hatch_manifest.json`;
    return JSON.parse(fs.readFileSync(manifestPath));
}

function findAsset(manifest, sought) {
    return manifest.assets.find(asset => sought.asset_id === asset.asset_id);
}

function expectPromiseRejects(p) {
    return p.then(() => {
        throw new Error('Expected promise to reject, but it resolved!');
    }, () => {});
}

describe('Hatch', () => {
    let hatch;

    afterEach(() => {
        if (fs.existsSync(hatch.get_path())) {
            rmrf(hatch.get_path());
        }
    });

    describe('required params', () => {
        it('can return path of hatch', () => {
            hatch = new libingester.Hatch('abcd', 'en');
            expect(hatch.get_path()).to.match(/hatch_abcd_[0-9_]+/);
        });

        it('can return the name of hatch', () => {
            hatch = new libingester.Hatch('testing', 'en');
            expect(hatch.get_name()).to.equal('testing');
        });

        it('can return the language of hatch', () => {
            hatch = new libingester.Hatch('abcd', 'something');
            expect(hatch.get_language()).to.equal('something');
        });

        it('can be forced to use specific path', () => {
            hatch = new libingester.Hatch('abcd', 'en', { path: './foo_bar_baz' });
            expect(hatch.get_path()).to.match(/foo_bar_baz/);
        });

        it('requires name and lang parameters to instantiate', () => {
            expect(() => {
                // eslint-disable-next-line no-new
                new libingester.Hatch();
            }).to.throw();

            expect(() => {
                // eslint-disable-next-line no-new
                new libingester.Hatch('abcd');
            }).to.throw();
        });

        // XXX: This is to ensure that v2-converted ingesters know that they
        //      need to use the newer api.
        it('requires second param to be a string', () => {
            expect(() => {
                // eslint-disable-next-line no-new
                new libingester.Hatch('abcd', { foo: 'bar' });
            }).to.throw();
        });
    });

    describe('argv no-tgz option', () => {
        beforeEach(() => {
            config.clean();
        });
        afterEach(() => {
            config.clean();
        });
        it('does not blow up when no-tgz arg is missing', () => {
            // Implicit non-exception
            hatch = new libingester.Hatch('aacd', 'en', { argv: ['/some/path'] });
        });

        it('does not blow up when no-tgz arg is at the end', () => {
            // Implicit non-exception
            hatch = new libingester.Hatch('abad', 'en', { argv: [ '/blah', '--no-tgz' ] });
        });

        it('does not blow up when no-tgz arg is at the end', () => {
            // Implicit non-exception
            hatch = new libingester.Hatch('abbd', 'en', { argv: [ '/blah', '--no-tgz' ] });
        });

        it('does not skip tgz by default', () => {
            hatch = new libingester.Hatch('aaaa', 'en', { argv: ['/blah'] });
            expect(hatch.is_exporting_tgz()).to.be.equal(true);

            return hatch.finish().then(() => {
                expect(fs.existsSync(`${hatch.get_path()}.tar.gz`)).to.be.equal(true);

                fs.unlinkSync(`${hatch.get_path()}/hatch_manifest.json`);
                fs.unlinkSync(`${hatch.get_path()}.tar.gz`);
            });
        });

        it('skip tgz if flag set', () => {
            hatch = new libingester.Hatch('abce', 'en', { argv: [ '/blah', '--no-tgz' ] });
            expect(hatch.is_exporting_tgz()).to.be.equal(false);

            return hatch.finish().then(() => {
                expect(fs.existsSync(`${hatch.get_path()}.tar.gz`)).to.be.equal(false);

                fs.unlinkSync(`${hatch.get_path()}/hatch_manifest.json`);
            });
        });
    });

    describe('argv path option', () => {
        beforeEach(() => {
            config.clean();
        });
        afterEach(() => {
            config.clean();
        });
        it('does not blow up when path arg is not there', () => {
            // Implicit non-exception
            hatch = new libingester.Hatch('abcd', 'en', { argv: [ '--foo', '/some/path' ] });
        });

        it('can process path correctly from passed in argv', () => {
            hatch = new libingester.Hatch('abcd', 'en', { argv: [ '--path', './hatch_foo' ] });
            expect(hatch.get_path()).to.equal('./hatch_foo');
        });

        it('does not break if invalid arg position', () => {
            hatch = new libingester.Hatch('abcd', 'en', { argv: [ 'foo', '--path' ] });
            expect(hatch.get_path()).to.match(/hatch_abcd_[0-9_]+/);
        });

        it('creates the directory path if missing', () => {
            const targetDir = './abcdefg';
            if (fs.existsSync(targetDir)) {
                fs.rmdirSync(targetDir);
            }

            expect(fs.existsSync(targetDir)).to.be.equal(false);

            hatch = new libingester.Hatch('abcd', 'en', { argv: [ '--path', targetDir ] });
            expect(fs.lstatSync(targetDir).isDirectory()).to.be.equal(true);
        });

        it('does not break if directory is already there', () => {
            const targetDir = './abcdefg2';
            if (fs.existsSync(targetDir)) {
                fs.rmdirSync(targetDir);
            }
            fs.mkdirSync(targetDir, 0o775);

            expect(fs.lstatSync(targetDir).isDirectory()).to.be.equal(true);

            hatch = new libingester.Hatch('abcd', 'en', { argv: [ '--path', targetDir ] });
        });
    });

    describe('argv urls option', () => {
        beforeEach(() => {
            config.clean();
        });
        afterEach(() => {
            config.clean();
        });
        it('null when urls arg is missing', () => {
            hatch = new libingester.Hatch('aacd', 'en', { argv: ['/some/path'] });
            expect(hatch.get_urls()).to.be.a('null');
        });
        it('can process urls correctly from passed in argv', () => {
            const argv = [ '--urls', 'https://foo.com', 'https://bar.com' ];
            hatch = new libingester.Hatch('abcd', 'en',
                                          { argv });
            expect(hatch.get_urls()).to.have.members([ 'https://foo.com',
                                                       'https://bar.com' ]);
        });
    });

    describe('handles failed assets', () => {
        let expectedError;
        beforeEach(() => {
            config.clean();
            hatch = new libingester.Hatch('abcd', 'en', { argv: ['--no-tgz'] });
            expectedError = new Error('expected error');
            expectedError.stack = '';
        });
        afterEach(() => {
            config.clean();
        });

        it('fails if all assets failed', () => {
            const fails = new MockAsset();
            fails.fails_with_error(expectedError);
            hatch.save_asset(fails);

            return expectPromiseRejects(hatch.finish());
        });

        it('fails if more than 90% of assets failed', () => {
            const assets = createAssets(100);
            assets.slice(0, 91).forEach(asset => asset.fails_with_error(expectedError));
            assets.forEach(asset => hatch.save_asset(asset));

            return expectPromiseRejects(hatch.finish());
        });

        it('passes if 90% or fewer assets failed', () => {
            const assets = createAssets(100);
            assets.slice(0, 90).forEach(asset => asset.fails_with_error(expectedError));
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
            [ root, child, succeeds ].forEach(asset => hatch.save_asset(asset));

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
            root.set_dependent_assets([ child1, child2 ]);

            // add a successful asset to prevent the hatch from failing
            const succeeds = new MockAsset();

            [ root, child1, child2, succeeds ].forEach(asset => hatch.save_asset(asset));

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
            config.clean();
            hatch = new libingester.Hatch('abcd', 'en', { argv: ['--no-tgz'] });
        });
        afterEach(() => {
            config.clean();
        });

        it('only assigns parent assets the "isToplevel" attribute', () => {
            const p1 = new MockAsset();
            const p2 = new MockAsset();
            const c1 = new MockAsset();
            const c2 = new MockAsset();
            const c3 = new MockAsset();

            p1.set_dependent_assets([ c1, c2 ]);
            p2.set_dependent_assets([c3]);
            [ p1, p2, c1, c2, c3 ].forEach(a => hatch.save_asset(a));

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

describe('MockAsset', () => {
    it('can set tags', () => {
        const asset = new MockAsset();
        asset.set_tags([ 'some', 'tags' ]);
        const metadata = asset.to_metadata();
        expect(metadata.tags).to.deep.equal([ 'some', 'tags' ]);
    });

    it('can set null synopsis', () => {
        const asset = new MockAsset();
        expect(() => {
            // eslint-disable-next-line no-undefined
            asset.set_synopsis(undefined);
        }).to.not.throw();
    });
});
