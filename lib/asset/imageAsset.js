// eslint-disable-next-line no-nested-ternary
'use strict';

const BaseAsset = require('./baseAsset');

/** */
class ImageAsset extends BaseAsset {
    get ALLOWED_METADATA() {
        return new Set([ ...super.ALLOWED_METADATA, 'image_data' ]);
    }

    constructor(metadata = {}) {
        super(metadata);

        this._object_type = 'ImageObject';
    }

    /**
     * Set multiple metadata at once.
     * @augments BaseAsset#set_metadata
     * @param {Object} metadata - The metadata can be:
     * @param {(Buffer|Promise<Buffer>)} metadata.image_data - See
     *  {@link ImageAsset#set_image_data}.
     */
    set_metadata(metadata) {
        super.set_metadata(metadata);

        Object.entries(metadata).forEach(([ key, value ]) => {
            if (key === 'image_data') {
                const { content_type, image_data } = value;
                this.set_image_data(content_type, image_data);
            }
        });
    }

    /**
     * @param {string} contentType
     * @param {(Buffer|Promise<Buffer>)} imageData
     */
    set_image_data(contentType, imageData) {
        this._content_type = contentType;
        this._image_data = imageData;
    }

    _process() {
        // In case _image_data is a promise, resolve it before verifying it
        return Promise.resolve(this._image_data).then(() => {
            this._verifier.verify_image_data(this._image_data);
        });
    }

    to_data() {
        return this._image_data;
    }
}

module.exports = ImageAsset;
