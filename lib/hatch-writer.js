'use-strict';

const fs = require('fs-extra');
const glob = require('glob');

const { ImplementationError } = require('./errors');
const config = require('./config');
const Asset = require('./asset');

/**
 * Writes the hatch to the corresponding path in the filesystem.
 */
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
        if (config.reuseHatch) {
            return 'hatch';
        }
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
            from_date: config.fromDate,
            to_date: config.toDate,
            assets: [],
        };

        if (config.reuseHatch) {
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
            if (a.metadata.objectType !== Asset.ARTICLE_OBJECT_TYPE) {
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

    getWriteStats () {
        const total = glob.sync(`${this.path}/*metadata`).length;
        const failed = glob.sync(`${this.path}/*errors`).length;
        return { 'total': total, 'failed': failed };
    }
}

module.exports = HatchWriter;
