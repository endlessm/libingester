'use-strict';

const fs = require('fs-extra');

const Ingester = require('./ingester');
const { logger } = require('./logger');

const HATCH_VERSION = 2;

class IngesterV2 extends Ingester {
    get _hatchVersion () {
        return HATCH_VERSION;
    }

    async _getAssetV2 (assetId) {
        const metadata = await fs.readJson(`${this.hatchPath}/${assetId}.metadata`);
        return {
            'asset_id': metadata.assetID,
            'uri': metadata.canonicalURI,
            'title': metadata.title,
            // FIXME
            'isTopLevel': true,
        };
    }

    async addAsset (asset) {
        if (!asset.isValidTree()) {
            logger.error(
                `Asset ${asset.canonicalURI} has failed to ingest or it has failed children`);
            return;
        }

        const assets = asset.flattenAssetTree();

        const jsonOptions = { 'spaces': 2 };

        for (const a of assets) {
            await a.finish();

            if (a.data !== null) {
                await fs.writeFile(`${this.hatchPath}/${a.id}.data`, a.data);
                a.metadata.cdnFilename = `${a.id}.data`;
            }

            a.metadata.published = a.metadata.publishedDate;

            await fs.writeJson(`${this.hatchPath}/${a.id}.metadata`, a.metadata, jsonOptions);
            this.hatchManifest.assets.push(a.id);
        }
    }

    async writeHatchManifest () {
        logger.warn('Writing a hatch compatible with v2');

        // FIXME do it async
        const assetsV2 = [];
        for (const a of this.hatchManifest.assets) {
            const a2 = await this._getAssetV2(a);
            assetsV2.push(a2);
        }

        this.hatchManifest.assets = assetsV2;
        // FIXME
        this.hatchManifest.videos = [];
        const jsonOptions = { 'spaces': 2 };
        return fs.writeJson(`${this.hatchPath}/hatch_manifest.json`, this.hatchManifest,
                            jsonOptions);
    }
}

module.exports = IngesterV2;
