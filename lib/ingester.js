'use-strict';

const fs = require('fs-extra');

const { logger } = require('./logger');
const { config } = require('./config');

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

    get _hatchVersion () {
        return HATCH_VERSION;
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
        const jsonOptions = { 'spaces': 2 };
        return fs.writeJson(`${this.hatchPath}/hatch_manifest.json`, this.hatchManifest,
                            jsonOptions);
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
            if (a.data !== null) {
                await Promise.resolve(a.data);
                await fs.writeFile(`${this.hatchPath}/${a.id}.data`, a.data);
            }

            await fs.writeJson(`${this.hatchPath}/${a.id}.metadata`, a.metadata, jsonOptions);
            this.hatchManifest.assets.push(a.id);
        }
    }

    async run () {
        logger.info(`Starting ingestion for ${this.name}...`);
        this.hatchPath = config.path || this.getFallbackHatchPath();

        this.hatchManifest = {
            name: this.name,
            language: this.language,
            hatch_version: this._hatchVersion,
            assets: [],
        };

        await fs.ensureDir(this.hatchPath);

        await this.ingest();

        await this.writeHatchManifest();
        logger.info(`Ingestion done. Hatch created at ${this.hatchPath}`);
    }

    async ingest () {
        throw new Error('You have to implement Ingester.ingest');
    }
}

module.exports = Ingester;
