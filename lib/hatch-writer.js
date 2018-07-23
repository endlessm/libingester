'use-strict';

const fs = require('fs-extra');

const { ImplementationError } = require('./errors');

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

    async setup () {
        this.manifest = {
            name: this.ingester.name,
            language: this.ingester.language,
            hatch_version: this.version,
            assets: [],
        };

        await fs.ensureDir(this.path);
    }

    async writeAssets () {
        throw new ImplementationError('HatchWriter.writeAssets');
    }

    async writeManifest () {
        return fs.writeJson(`${this.path}/hatch_manifest.json`, this.manifest,
                            this._jsonOptions);
    }
}

module.exports = HatchWriter;
