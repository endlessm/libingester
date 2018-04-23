// eslint-disable-next-line no-nested-ternary
'use strict';

const crypto = require('crypto');
const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');

const { getTimestamp } = require('./util');
const { logger } = require('../logging');
const { ValidationError } = require('../errors');
const assetVerifier = require('./verifier');

/** */
class BaseAsset {
    static get EKN_STATIC_TAG() {
        return 'EknStaticTag';
    }

    constructor(verifier = assetVerifier) {
        this._asset_id = this._newAssetId();
        this._ekn_tags = [];
        this._tags = [];

        this._verifier = verifier;
    }

    _newAssetId() {
        const hash = crypto.createHash('sha1');
        hash.update(crypto.randomBytes(32));
        return hash.digest('hex');
    }

    _ensureSynopsis(value) {
        if (typeof value === 'undefined') {
            logger.warn('Trying to set an empty synopsis! ' +
                        'This is most likely an error in the ingester!');
            return null;
        }

        return value.trim().replace(/[\s]{1,}/g, ' ');
    }

    _ensureDate(value) {
        if (value instanceof Date) {
            if (isNaN(value.getTime())) {
                logger.warn('Provided an invalid date object');
                return null;
            }
            return value;
        }

        try {
            return new Date(value);
        } catch (err) {
            logger.warn(`Could not coerce value into a date: ${value}`);
            return null;
        }
    }


    /**
     * 20-byte hex ID of the document
     * @type string
     * @readonly
     */
    get asset_id() {
        return this._asset_id;
    }

    /**
     * @param {string} value - Title of the document
     */
    set_title(value) {
        this._title = value.trim();
    }

    /**
     * Sets the text that will be shown as the synopsis of a document. (The
     * synopsis is often shown in the UI on "cards" if there is enough space.)
     * @param {string} value - Text describing the document
     */
    set_synopsis(value) {
        this._synopsis = this._ensureSynopsis(value);
    }

    /**
     * Sets an image asset to be the article's thumbnail. (An image asset is
     * returned e.g. from {@link utildownload_img|util.download_img} or
     * {@link utildownload_image|util.download_image}.)
     * @param {ImageAsset} value - Image
     */
    set_thumbnail(value) {
        this._thumbnail_asset_id = value.asset_id;
    }

    /**
     * @param {string} value
     */
    set_canonical_uri(value) {
        this._canonical_uri = value;
    }

    /**
     * @param {(Date|number|string)} value
     */
    set_last_modified_date(value) {
        this._last_modified_date = this._ensureDate(value);
    }

    /**
     * Pass the date that the post or article was published. You can pass a
     * Date object here. If it is not a Date object, then `new Date()` will be
     * called on it, so you can also pass e.g. a timestamp.
     * @param {(Date|number|string)} value - The publishing date of this
     *   document
     */
    set_date_published(value) {
        this._date_published = this._ensureDate(value);
    }

    /**
     * @param {number} value
     */
    set_sequence_number(value) {
        this._sequence_number = value;
    }

    /**
     * @param {string} value
     */
    set_license(value) {
        this._license = value;
    }

    /**
     * Pass in an array of ID strings for "sets" (categories, tags). The ID
     * string is not the human-readable string (though it's possible for the
     * two to be identical); you can create a human-readable name for the set
     * in your app using other tools.
     *
     * Compare {@link NewsArticle#set_section}.
     *
     * @param {string[]} value - List of ID strings
     */
    set_tags(value) {
        this._tags = value;
    }

    _normalize_tags() {
        return this._make_tags().concat(this._ekn_tags)
            .filter(tag => typeof tag === 'string')
            .map(tag => tag.trim());
    }

    /**
     * @returns {(Buffer|null)}
     */
    to_data() {
        return null;
    }

    /**
     * @returns {Object}
     */
    to_metadata() {
        // Build an object with all required fields
        const metadata = {
            'assetID': this._asset_id,
            'objectType': this._object_type,
            'contentType': this._content_type,

            'canonicalURI': this._canonical_uri,
            'matchingLinks': [this._canonical_uri],

            'title': this._title,
            'tags': this._normalize_tags(),
            'revisionTag': getTimestamp(),
        };

        // Add optional fields if they're present
        if (this._date_published) {
            metadata.published = this._date_published.toISOString();
        }
        if (this._last_modified_date) {
            metadata.lastModifiedDate = this._last_modified_date.toISOString();
            metadata.revisionTag = this._last_modified_date.toISOString();
        }
        if (typeof this._sequence_number !== 'undefined') {
            metadata.sequenceNumber = this._sequence_number;
        }
        if (this._license) {
            metadata.license = this._license;
        }
        if (this._synopsis) {
            metadata.synopsis = this._synopsis;
        }
        if (this._thumbnail_asset_id) {
            metadata.thumbnail = this._thumbnail_asset_id;
        }

        return metadata;
    }

    _process() {
        return Promise.resolve();
    }

    _make_tags() {
        return this._tags;
    }

    _replace_dom_asset_ids() {
        const $elem = this._document;

        if (!$elem) {
            throw new Error('Must call asset.render() before saving ' +
                            `${this.constructor.name} to a hatch.`);
        }

        $elem('[data-libingester-asset-id]').each(function () {
            const $asset = cheerio(this);

            const assetId = $asset.attr('data-libingester-asset-id');
            if (assetId) {
                $asset.attr('data-soma-job-id', assetId);
                $asset.attr('data-libingester-asset-id', null);
            }

            if (!$asset.attr('data-soma-job-id')) {
                throw new ValidationError('Document has media without associated asset. ' +
                                          'Please ingest it or drop it.');
            }
        });
    }

    _save_to_hatch(hatch) {
        const hatchPath = hatch._path;
        hatch._assets.push(this);
        hatch._promises.push(this._process().then(() => {
            const data = this.to_data();
            const metadata = this.to_metadata();

            if (data) {
                metadata.cdnFilename = `${metadata.assetID}.data`;
            }

            this._verifier.verify_metadata(metadata);

            const metadataText = JSON.stringify(metadata, null, 2);
            const promises = [];

            promises.push(fs.writeFile(path.join(hatchPath, `${this._asset_id}.metadata`),
                                       metadataText,
                                       { encoding: 'utf-8' }));

            if (data) {
                promises.push(fs.writeFile(path.join(hatchPath, `${this._asset_id}.data`), data,
                                           { encoding: 'utf-8' }));
            }

            return Promise.all(promises);
        }).catch(err => {
            logger.error(err);
            if (err instanceof this._verifier.VerificationError && err.metadata) {
                logger.debug(err.metadata);
            }
            hatch._failed_assets.push(this);
        }));
    }

    _get_thumbnail_asset_id() {
        return this._thumbnail_asset_id;
    }

    _get_dependent_asset_ids() {
        return [];
    }

    /**
     * @returns {Set<BaseAsset>}
     */
    get_dependent_assets() {
        const assets = new Set();
        const thumbnailId = this._get_thumbnail_asset_id();
        if (thumbnailId) {
            assets.add(thumbnailId);
        }
        for (const dependentAssetId of this._get_dependent_asset_ids()) {
            assets.add(dependentAssetId);
        }
        return assets;
    }
}

module.exports = BaseAsset;
