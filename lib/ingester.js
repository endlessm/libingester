'use-strict';

const HatchWriterV3 = require('./hatch-writer-v3');
const HatchWriterV2 = require('./hatch-writer-v2');
const logger = require('./logger');
const config = require('./config');
const { ImplementationError } = require('./errors');

class Ingester {
    constructor (ingesterPath = null) {
        this.ingesterPath = ingesterPath;
        this.assetsCount = { 'total': 0, 'failed': 0 };

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
        const failedProportion = this.assetsCount.failed / this.assetsCount.total;
        if (failedProportion === 0) {
            return { 'status': 'OK', 'returnCode': 0 };
        }
        if (failedProportion > config.hatchFailRateThreshold) {
            return { 'status': 'FAILED', 'returnCode': 1 };
        }
        return { 'status': 'WARNING', 'returnCode': 13 };
    }

    exit () {
        process.exit(this.getIngestionStatus().returnCode);
    }

    /* eslint-disable no-empty-function, no-unused-vars */
    overrideConfig (newConfig) {
    }
    /* eslint-enable */

    async addAsset (asset) {
        const assets = asset.flattenAssetTree();
        this.assetsCount.total += assets.length;
        if (!asset.isValidTree()) {
            this.assetsCount.failed += assets.length;
            logger.error(
                `Asset ${asset.metadata.canonicalURI} has failed to ingest or it has failed children`);
            return;
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
            process.exit(1);
        }

        await this.hatchWriter.writeManifest();

        logger.info(`Ingestion done. Status: ${this.getIngestionStatus().status}`);
        logger.info(`Total assets: ${this.assetsCount.total}`);
        logger.info(`Failed assets: ${this.assetsCount.failed}`);
        logger.info(`Hatch created at: ${this.hatchWriter.path}`);

        if (exit) {
            this.exit();
        }
    }

    async ingest () {
        throw new ImplementationError('Ingester.ingest');
    }
}

module.exports = Ingester;
