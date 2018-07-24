'use-strict';

const fs = require('fs-extra');

const { ImplementationError } = require('./errors');
const { config } = require('./config');

class HatchWriter {
    constructor (ingester, path) {
        this.ingester = ingester;
        this.path = path || this.fallbackPath;
        this.manifest = null;
    }

    get version () {
        throw new ImplementationError('HatchWriter.version');
    }

    get fallbackPath () {
        return `hatch_${this.ingester.name}_${new Date().toISOString()}`;
    }

    get _jsonOptions () {
        return { 'spaces': 2 };
    }

    get manifestFileName () {
        return `${this.path}/hatch_manifest.json`;
    }

    async setup () {
        this.manifest = {
            name: this.ingester.name,
            language: this.ingester.language,
            hatch_version: this.version,
            assets: [],
        };

        if (config.liveMode) {
            this.cachedAssets = new Map();
            await this.cacheCurrentAssets();
        }

        await fs.emptyDir(this.path);
    }

    async cacheCurrentAssets () {
        let currentManifest;
        try {
            currentManifest = await fs.readJson(this.manifestFileName);
        } catch (err) {
            return;
        }
        if (currentManifest.hatch_version !== this.version) {
            return;
        }
        for (const assetId of this.readAssetIds(currentManifest)) {
            try {
                const metadata = await fs.readJson(`${this.path}/${assetId}.metadata`);
                this.cachedAssets.set(metadata.canonicalURI, assetId);
            } catch (err) {
                continue;
            }
        }
    }

    async mapCachedAssets (assets) {
        for (const a of assets) {
            // Only persist asset IDs of top level assets:
            if (a.metadata.objectType !== 'ArticleObject') {
                continue;
            }
            const cachedAssetId = this.cachedAssets.get(a.metadata.canonicalURI);
            if (cachedAssetId) {
                a.metadata.assetID = cachedAssetId;
            }
        }
        return assets;
    }

    readAssetIds () {
        throw new ImplementationError('HatchWriter.readAssetIds');
    }

    async writeAssets () {
        throw new ImplementationError('HatchWriter.writeAssets');
    }

    async writeManifest () {
        return fs.writeJson(this.manifestFileName, this.manifest, this._jsonOptions);
    }
}

module.exports = HatchWriter;
