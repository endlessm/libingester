'use-strict';

const fs = require('fs-extra');

const HatchWriter = require('./hatch-writer');
const { config } = require('./config');

const HATCH_VERSION = 3;

class HatchWriterV3 extends HatchWriter {
    get version () {
        return HATCH_VERSION;
    }

    readAssetIds (manifest) {
        return manifest.assets;
    }

    async writeAssets (assets) {
        let parsedAssets = assets;
        if (config.reuseHatch) {
            parsedAssets = await super.mapCachedAssets(assets);
        }

        for (const a of parsedAssets) {
            await a.finish();

            if (a.data !== null) {
                await fs.writeFile(`${this.path}/${a.id}.data`, a.data);
            }

            await fs.writeJson(`${this.path}/${a.id}.metadata`, a.metadata,
                               this._jsonOptions);

            this.manifest.assets.push(a.id);
        }
    }
}

module.exports = HatchWriterV3;
