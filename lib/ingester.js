'use-strict';

const HatchWriterV3 = require('./hatch-writer-v3');
const HatchWriterV2 = require('./hatch-writer-v2');
const logger = require('./logger');
const config = require('./config');
const { ImplementationError } = require('./errors');

class Ingester {
    constructor (ingesterPath = null) {
        this.ingesterPath = ingesterPath;

        if (!this.ingesterPath) {
            this._name = 'libingester';
        } else {
            this._name = require(`${this.ingesterPath}/package`).name;
        }

        this.overrideConfig(config.config);
        config.parse();
        logger.initialize();

        let HatchWriterClass = HatchWriterV3;
        if (config.hatchV2) {
            logger.warn('Writing a V2 hatch');
            HatchWriterClass = HatchWriterV2;
        }
        this.hatchWriter = new HatchWriterClass(this, config.path);
    }

    get name () {
        return this._name;
    }

    get language () {
        return 'en';
    }

    /* eslint-disable no-empty-function, no-unused-vars */
    overrideConfig (newConfig) {
    }
    /* eslint-enable */

    async addAsset (asset) {
        if (!asset.isValidTree()) {
            logger.error(
                `Asset ${asset.canonicalURI} has failed to ingest or it has failed children`);
            return;
        }

        const assets = asset.flattenAssetTree();
        await this.hatchWriter.writeAssets(assets);
    }

    async run () {
        logger.info(`Running ingester ${this.name} ` +
                    `from ${config.fromDate.toISOString()} ` +
                    `to ${config.toDate.toISOString()}...`);
        await this.hatchWriter.setup();
        try {
            await this.ingest();
        } catch (err) {
            logger.error('Ingestion error!');
            // FIXME should return with RC 1, also for a big % of
            // failed assets.
            throw err;
        }
        await this.hatchWriter.writeManifest();
        logger.info(`Ingestion done. Hatch created at: ${this.hatchWriter.path}`);
    }

    async ingest () {
        throw new ImplementationError('Ingester.ingest');
    }
}

module.exports = Ingester;
