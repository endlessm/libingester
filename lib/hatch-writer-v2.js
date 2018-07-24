'use-strict';

const fs = require('fs-extra');

const HatchWriter = require('./hatch-writer');
const formatMetadata = require('./utils/format-metadata');
const { config } = require('./config');

const HATCH_VERSION = 2;

const HATCHV3_TO_HATCHV2 = {
    'publishedDate': 'published',
    'body': 'document',
};

class HatchWriterV2 extends HatchWriter {
    get version () {
        return HATCH_VERSION;
    }

    async getAssetManifestData (assetId) {
        const metadata = await fs.readJson(`${this.path}/${assetId}.metadata`);
        return {
            'asset_id': metadata.assetID,
            'uri': metadata.canonicalURI,
            // FIXME
            'isTopLevel': true,
        };
    }

    *readAssetIds (manifest) {
        for (const asset of manifest.assets) {
            yield asset['asset_id'];
        }
    }

    async writeAssets (assets) {
        let parsedAssets = assets;
        if (config.liveMode) {
            parsedAssets = await super.mapCachedAssets(assets);
        }

        for (const a of parsedAssets) {
            await a.finish();

            if (a.data !== null) {
                await fs.writeFile(`${this.path}/${a.id}.data`, a.data);
                a.metadata.cdnFilename = `${a.id}.data`;
            }

            a.metadata = formatMetadata(a.metadata, HATCHV3_TO_HATCHV2);

            await fs.writeJson(`${this.path}/${a.id}.metadata`, a.metadata,
                               this._jsonOptions);

            this.manifest.assets.push(a.id);
        }
    }

    async writeManifest () {
        // FIXME do it async
        const assetsV2 = [];
        for (const a of this.manifest.assets) {
            const a2 = await this.getAssetManifestData(a);
            assetsV2.push(a2);
        }

        this.manifest.assets = assetsV2;

        // FIXME
        this.manifest.videos = [];

        return super.writeManifest();
    }
}

module.exports = HatchWriterV2;
