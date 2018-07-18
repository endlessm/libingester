'use-strict';

const fs = require('fs-extra');

const { config } = require('./config');

const HATCH_VERSION = 3;

class HatchWriter {
    constructor (ingester) {
        this.ingester = ingester;
        this.path = null;
        this.manifest = null;
    }

    get version () {
        return HATCH_VERSION;
    }

    get fallbackPath () {
        return `hatch_${this.ingester.name}_${new Date().toISOString()}`;
    }

    get _jsonOptions () {
        return { 'spaces': 2 };
    }

    async setup () {
        this.path = config.path || this.fallbackPath;

        this.manifest = {
            name: this.ingester.name,
            language: this.ingester.language,
            hatch_version: this.version,
            assets: [],
        };

        await fs.ensureDir(this.path);
    }

    async writeAssets (assets) {
        for (const a of assets) {
            await a.finish();

            if (a.data !== null) {
                await fs.writeFile(`${this.path}/${a.id}.data`, a.data);
            }

            await fs.writeJson(`${this.path}/${a.id}.metadata`, a.metadata,
                               this._jsonOptions);

            this.manifest.assets.push(a.id);
        }
    }

    async writeManifest () {
        return fs.writeJson(`${this.path}/hatch_manifest.json`, this.manifest,
                            this._jsonOptions);
    }
}

module.exports = HatchWriter;
