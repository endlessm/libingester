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

    getIngestionStatus () {
        const stats = this.hatchWriter.getWriteStats();
        const failedProportion = stats.failed / stats.total;

        if (failedProportion === 0) {
            return { ...stats, 'message': 'OK', 'returnCode': 0 };
        }
        if (failedProportion > config.hatchFailRateThreshold) {
            return { ...stats, 'message': 'FAILED', 'returnCode': 1 };
        }
        return { ...stats, 'message': 'WARNING', 'returnCode': 13 };
    }

    exit (returnCode) {
        process.exit(returnCode || this.getIngestionStatus().returnCode);
    }

    /* eslint-disable no-empty-function, no-unused-vars */
    overrideConfig (newConfig) {
    }
    /* eslint-enable */

    async addAsset (asset) {
        const assets = asset.flattenAssetTree();

        for (const a of assets) {
            await a.finish();
        }

        if (!asset.isValidTree()) {
            logger.error(
                `Asset ${asset.metadata.canonicalURI}` +
                'has failed to ingest or it has failed children');
        }

        await this.hatchWriter.writeAssets(assets);
    }

    async run (exit = true) {
        logger.info(`Running ingester ${this.name} ` +
                    `from ${config.fromDate.toISOString()} ` +
                    `to ${config.toDate.toISOString()}...`);

        await this.hatchWriter.setup();

        try {
            await this.ingest();
        } catch (err) {
            logger.error(`Unhandled ingestion error:\n${err.stack}`);
            this.exit(1);
        }

        await this.hatchWriter.writeManifest();

        const status = this.getIngestionStatus();
        logger.info(`Ingestion done. Status: ${status.message}`);
        logger.info(`Total assets: ${status.total}`);
        logger.info(`Failed assets: ${status.failed}`);
        logger.info(`Hatch created at: ${this.hatchWriter.path}`);

        if (exit) {
            this.exit(status.returnCode);
        }
    }

    async ingest () {
        throw new ImplementationError('Ingester.ingest');
    }
}

module.exports = Ingester;
