'use strict';

const fs = require('fs-extra');
const path = require('path');

const BaseAsset = require('./baseAsset');
const { logger } = require('../logging');

/** */
class VideoAsset extends BaseAsset {
    get ALLOWED_METADATA() {
        return new Set([ ...super.ALLOWED_METADATA, 'download_uri' ]);
    }

    constructor(metadata = {}) {
        super(metadata);

        this._object_type = 'VideoObject';
    }

    /**
     * Set multiple metadata at once.
     * @augments BaseAsset#set_metadata
     * @param {Object} metadata - The metadata can be:
     * @param {string} metadata.download_uri - See {@link VideoAsset#set_download_uri}.
     */
    set_metadata(metadata) {
        super.set_metadata(metadata);

        Object.entries(metadata).forEach(([ key, value ]) => {
            if (key === 'download_uri') {
                this.set_download_uri(value);
            }
        });
    }

    /**
     * @param {string} value
     */
    set_download_uri(value) {
        this._download_uri = value;
    }

    _save_to_hatch(hatch) {
        hatch._videos.push(this.to_hatch_manifest());

        hatch._promises.push(this._process().then(() => {
            const metadata = this.to_hatch_metadata();
            this._verifier.verify_metadata(metadata);
            const metadataText = JSON.stringify(metadata, null, 2);
            return fs.writeFile(path.join(hatch._path, `${this._asset_id}.metadata`),
                                metadataText,
                                { encoding: 'utf-8' });
        })
        .catch(err => {
            logger.error(err);
            if (err instanceof this._verifier.VerificationError && err.metadata) {
                logger.debug(err.metadata);
            }
            hatch._failed_asset_ids.add(this.asset_id);
        }));
    }

    /**
     * @returns {Object}
     */
    to_hatch_manifest() {
        return {
            asset_id: this.asset_id,
            uri: this._download_uri,
            title: this._title,
        };
    }

    /**
     * @returns {Object}
     */
    to_hatch_metadata() {
        const metadata = super.to_hatch_metadata();
        metadata.canonicalURI = metadata.canonicalURI || this._download_uri;
        if (!metadata.matchingLinks.length || !metadata.matchingLinks[0]) {
            metadata.matchingLinks = [this._download_uri];
        }
        return metadata;
    }
}

module.exports = VideoAsset;
