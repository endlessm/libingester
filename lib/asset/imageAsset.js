'use strict';

const BaseAsset = require('./baseAsset');

/** */
class ImageAsset extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'ImageObject';
    }

    /**
     * @param {string} content_type
     * @param {(Buffer|Promise<Buffer>)} image_data
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
