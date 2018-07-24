'use-strict';

const fs = require('fs-extra');

const HatchWriter = require('./hatch-writer');

const HATCH_VERSION = 2;

class HatchWriterV2 extends HatchWriter {
    get version () {
        return HATCH_VERSION;
    }

    async getAssetManifestData (assetId) {
        const metadata = await fs.readJson(`${this.path}/${assetId}.metadata`);
        return {
            'asset_id': metadata.assetID,
            'uri': metadata.canonicalURI,
            'title': metadata.title,
            // FIXME
            'isTopLevel': true,
        };
    }

    async writeAssets (assets) {
        for (const a of assets) {
            await a.finish();

            if (a.data !== null) {
                await fs.writeFile(`${this.path}/${a.id}.data`, a.data);
                a.metadata.cdnFilename = `${a.id}.data`;
            }

            a.metadata.published = a.metadata.publishedDate;

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
