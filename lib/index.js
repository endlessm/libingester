'use strict';

const path = require('path');

const aws = require('aws-sdk');
const fs = require('fs-extra');
const tar = require('tar');

const BlogArticle = require('./asset/blogArticle');
const config = require('./config');
const DictionaryAsset = require('./asset/dictionaryAsset');
const GalleryImageArticle = require('./asset/galleryImageArticle');
const GalleryVideoArticle = require('./asset/galleryVideoArticle');
const ImageAsset = require('./asset/imageAsset');
const logging = require('./logging');
const NewsArticle = require('./asset/newsArticle');
const util = require('./util');
const verifier = require('./asset/verifier');
const VideoAsset = require('./asset/videoAsset');
const VideoArticle = require('./asset/videoArticle');

const { ValidationError } = require('./errors');
const { getTimestamp } = require('./asset/util');

// Convenience variable so that we don't need to prefix every
// log directive
const { logger } = logging;

// For some reason we still seem to need this method promisified
const { promisify } = require('util');
fs.writeFile = promisify(fs.writeFile);


// Increment this value by one anytime the hatch format changes in a backwards
// incompatible way
const HATCH_VERSION = 2;

// Max acceptable fail rate for a hatch
const HATCH_FAIL_RATE_THRESHOLD = 0.9;

function isSubset(a, b) {
    for (const item of a) {
        if (!b.has(item)) {
            return false;
        }
    }

    return true;
}

/**
 * Creates the hatch and parses arguments.
 *
 * @param {string} name - A name for the ingester
 * @param {string} language - ISO 3166-1 alpha-2 two-letter language code, for
 *   use in generating spelling and stopwords dictionaries for search
 * @param {Object} options [{}] - A dictionary with options. For a
 * list of available options see {@link
 * configparse_options|config.parse_options}
*/
class Hatch {
    constructor(name, language, options) {
        this._promises = [];
        this._assets = [];
        this._failed_assets = [];
        this._videos = [];

        config.parse_options(options);

        if (!name) {
            throw new Error('ERROR! Hatch name must be specified!');
        }

        // The string check is to ensure that we don't consider older-api
        // `options` as the language which was in this position before
        // eslint-disable-next-line no-extra-parens
        if (!language || (typeof language !== 'string' && !(language instanceof String))) {
            throw new Error('ERROR! Hatch language must be specified!');
        }

        this._name = name;
        this._language = language;
        this._path = config.get_setting('path') || this._get_default_path();

        if (!fs.existsSync(this._path)) {
            fs.mkdirSync(this._path, 0o775);
        }
    }

    /**
     * Indicates whether the hatch will be compressed into a tar.gz file after
     * it is finished. The original hatch directory will not be removed.
     * @returns {boolean}
     */
    is_exporting_tgz() {
        return !config.get_setting('no-tgz');
    }


    /**
     *  Return an array of URLs if passed as settings.
     *
     *  The ingesters can use this URLs to reingest a batch of
     *  articles.
     * @returns {Array|null}
     */
    get_urls() {
        return config.get_setting('urls') || null;
    }

    /**
     * @returns {string} - The two-letter language code set when creating the
     *   hatch
     */
    get_language() {
        return this._language;
    }

    /**
     * @returns {string} - The name set when creating the hatch
     */
    get_name() {
        return this._name;
    }

    /**
     * @returns {string}
     */
    get_path() {
        return this._path;
    }

    _get_default_path() {
        return `hatch_${this._name.toLowerCase()}_${getTimestamp()}`;
    }

    _purge_failed_assets() {
        // Cache a list of failed asset ids for later
        const failedAssetIds = this._failed_assets.map(asset => asset.asset_id);

        // While we're processing elements in a hierarchical way, let's also
        // keep track of which assets are at the "toplevel", i.e. have no
        // parents
        const allAssetIds = this._assets.concat(this._videos).map(asset => asset.asset_id);
        const toplevelAssetIds = new Set(allAssetIds);

        let dependentsToPrune = [];
        let successfulAssets = this._assets.filter(asset => {
            // If an asset failed, dump it from the hatch
            if (this._failed_assets.includes(asset)) {
                return false;
            }

            // coerce any sets into array form
            const dependents = Array.from(asset.get_dependent_assets());

            // no toplevel asset is a dependent asset
            dependents.forEach(dependentAssetId => {
                toplevelAssetIds.delete(dependentAssetId);
            });

            // If an asset has failed dependents, consider it failed as well
            const hasFailedDependents = dependents.some(dependentAssetId => {
                return failedAssetIds.includes(dependentAssetId);
            });

            if (hasFailedDependents) {
                // keep track of which siblings we'll have to remove in a
                // later pass
                dependentsToPrune = dependentsToPrune.concat(dependents);
                return false;
            }

            return true;
        });

        // In a second pass, remove all otherwise successful assets which had
        // failed siblings
        successfulAssets = successfulAssets.filter(asset => {
            return !dependentsToPrune.includes(asset.asset_id);
        });

        // If this hatch is nonempty and had over 50% failures, consider it
        // failed and refuse to continue
        if (this._assets.length > 0) {
            // eslint-disable-next-line no-extra-parens
            const percentFailedAssets = 1 - (successfulAssets.length / this._assets.length);
            if (percentFailedAssets > HATCH_FAIL_RATE_THRESHOLD) {
                throw new Error(`More than ${HATCH_FAIL_RATE_THRESHOLD * 100}% ` +
                                'assets failed! Aborting hatch...');
            }
        }

        successfulAssets.forEach(asset => {
            asset._isToplevel = toplevelAssetIds.has(asset.asset_id);
        });

        // Videos just POJOs, so just set the isToplevel attribute directly
        this._videos.forEach(video => {
            video.isToplevel = toplevelAssetIds.has(video.asset_id);
        });

        this._assets = successfulAssets;
    }

    _validate_asset_references() {
        // Assure that all outgoing edges are satisfied.

        // Outgoing edges.
        const outgoing = new Set();

        // Node labels
        const assetIds = new Set();

        this._assets.forEach(asset => {
            assetIds.add(asset.asset_id);
            for (const outgoingAssetId of asset.get_dependent_assets()) {
                outgoing.add(outgoingAssetId);
            }
        });
        this._videos.forEach(video => {
            assetIds.add(video.asset_id);
        });

        // Assert that outgoing edges is contained in asset_ids.
        if (!isSubset(outgoing, assetIds)) {
            throw new ValidationError('Asset references inconsistent');
        }
    }

    // The manifest should contain a subset of the asset's fields needed by the
    // Portal to display the hatch's contents
    _save_hatch_manifest() {
        const assets = this._assets.map(asset => {
            return {
                asset_id: asset.asset_id,
                uri: asset._canonical_uri,
                title: asset._title,
                isToplevel: asset._isToplevel,
            };
        });

        // Sanity check the entries
        assets.forEach(verifier.verify_manifest_entry);

        const manifest = { name: this._name,
                           hatch_version: HATCH_VERSION,
                           language: this._language,
                           assets,
                           videos: this._videos };
        const manifestJson = JSON.stringify(manifest, null, 2);

        return fs.writeFile(path.join(this._path, 'hatch_manifest.json'),
                            manifestJson,
                            { encoding: 'utf-8' });
    }

    // Endless provides two buckets by default: dev and prod. If you're
    // ingesting content for use on the production Portal, be sure to set
    // NODE_ENV=production
    _get_default_bucket() {
        let env = 'dev';
        if (process.env.NODE_ENV === 'production') {
            env = 'prod';
        }

        return `com-endless--cloud-soma-${env}-hatch`;
    }

    _create_hatch_archive() {
        const tarballPath = `${this._path}.tar.gz`;
        const tarOptions = {
            gzip: true,
            file: tarballPath,
        };

        return tar.c(tarOptions, [this._path])
            .then(() => tarballPath);
    }

    /**
     * Waits for any pending downloads, creates the hatch manifests, and
     * optionally compresses the archive into a tar.gz file.
     * @returns {Promise}
     */
    finish() {
        logger.info('hatch: waiting for pending downloads...');
        return Promise.all(this._promises)
        .then(() => this._purge_failed_assets())
        .then(() => this._validate_asset_references())
        .then(() => {
            logger.info('hatch: exporting hatch manifest...');
            return this._save_hatch_manifest();
        })
        .then(() => {
            logger.info('hatch: creating hatch tarball...');

            // If we only are saving the dir, we return the path
            if (!this.is_exporting_tgz()) {
                return this._path;
            }

            return this._create_hatch_archive();
        })
        .then(tarballPath => {
            logger.info(`hatch: finished, saved to ${tarballPath}`);
        });
    }

    /**
     * Downloads and processes `asset` into metadata and data objects which
     * will be saved in the hatch.
     * @param {BaseAsset} asset
     */
    save_asset(asset) {
        asset._save_to_hatch(this);
    }

    /**
     * Explicitly save `asset` as failed.
     * @param {BaseAsset} asset
     */
    save_failed_asset(asset) {
        this._assets.push(asset);
        this._failed_assets.push(asset);
    }

    /**
     * Check if `asset` has failed.
     * @param {BaseAsset} asset
     */
    has_failed_asset(asset) {
        return this._failed_assets.includes(asset);
    }

    /**
     * Copies the generated hatch directory to `directory`. This can be used
     * for automating the ingestion of content.
     * @param {string} directory - A path
     * @returns {Promise}
     */
    copy_to_directory(directory) {
        return fs.copy(this._path, directory);
    }

    /**
     * Copies the generated hatch directory to an S3 bucket on AWS.
     * @param {string} bucket
     * @returns {Promise}
     */
    copy_to_s3(bucket) {
        const hatchId = path.basename(this._path);

        /* XXX: Configure this to use us-west-2 */
        const s3 = new aws.S3();

        let targetBucket = this._get_default_bucket();
        if (bucket) {
            targetBucket = bucket;
        }

        return fs.readdir(this._path).then(files => {
            const promises = files.map(filename => {
                const fullPath = path.join(this._path, filename);
                return fs.readFile(fullPath).then(contents => {
                    return s3.putObject({
                        Bucket: targetBucket,
                        Key: `${hatchId}/${filename}`,
                        Body: contents,
                    }).promise();
                });
            });

            return Promise.all(promises);
        }).then(() => {
            logger.info(`Hatch copied to http://${targetBucket}.s3.amazonaws.com/${hatchId}`);
        });
    }
}

module.exports = {
    BlogArticle,
    DictionaryAsset,
    GalleryImageArticle,
    GalleryVideoArticle,
    Hatch,
    ImageAsset,
    logging,
    NewsArticle,
    util,
    VideoArticle,
    VideoAsset,
};
