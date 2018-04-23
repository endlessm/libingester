'use strict';

const fs = require('fs-extra');
const path = require('path');

const BaseAsset = require('./baseAsset');
const { logger } = require('../logging');

/** */
class VideoAsset extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'VideoObject';
    }

    /**
     * @param {string} value
     */
    set_download_uri(value) {
        this._download_uri = value;
    }

    _save_to_hatch(hatch) {
        hatch._videos.push({
            asset_id: this.asset_id,
            uri: this._download_uri,
            title: this._title,
        });

        hatch._promises.push(this._process().then(() => {
            const metadata = this.to_metadata();
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
            hatch._failed_assets.push(this);
        }));
    }

    to_metadata() {
        const metadata = super.to_metadata();
        metadata.canonicalURI = metadata.canonicalURI || this._download_uri;
        if (!metadata.matchingLinks.length || !metadata.matchingLinks[0]) {
            metadata.matchingLinks = [this._download_uri];
        }
        return metadata;
    }
}

module.exports = VideoAsset;
