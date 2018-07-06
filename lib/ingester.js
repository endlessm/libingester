'use-strict';

const fs = require('fs-extra');
const util = require('util');

const { config } = require('./config');

const logger = require('./logger');

const HATCH_VERSION = 3;

class Ingester {
    constructor (ingesterPath = null) {
        this.ingesterPath = ingesterPath;

        if (!this.ingesterPath) {
            this._name = 'libingester';
        } else {
            this._name = require(`${this.ingesterPath}/package`).name;
        }

        this.hatchPath = null;
        this.hatchManifest = null;
    }

    get name () {
        return this._name;
    }

    get language () {
        return 'en';
    }

    getFallbackHatchPath () {
        return `hatch_${this.name}_${new Date().toISOString()}`;
    }

    async writeHatchManifest () {
        return fs.writeJson(`${this.hatchPath}/hatch_manifest.json`, this.hatchManifest);
    }

    async addAsset (asset) {
        if (!asset.isValidTree()) {
            logger.error(
                `Asset ${asset.canonicalURI} has failed to ingest or it has failed children`);
            return;
        }

        const assets = asset.flattenAssetTree();

        for (const a of assets) {
            await fs.writeJson(`${this.hatchPath}/${a.id}.metadata`, a.metadata);
            if (a.data !== null) {
                await util.promisify(fs.writeFile)(`${this.hatchPath}/${a.id}.data`, a.data);
            }
            this.hatchManifest.assets.push(a.id);
        }
    }

    async run () {
        this.hatchPath = config.path || this.getFallbackHatchPath();

        this.hatchManifest = {
            name: this.name,
            language: this.language,
            hatch_version: HATCH_VERSION,
            assets: [],
        };

        if (!await util.promisify(fs.exists)(this.hatchPath)) {
            await util.promisify(fs.mkdir)(this.hatchPath);
        }

        await this.ingest();

        await this.writeHatchManifest();
    }

    async ingest () {
        throw new Error('You have to implement Ingester.ingest');
    }
}

module.exports = Ingester;
