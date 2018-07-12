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
