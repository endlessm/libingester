'use strict';

const BaseAsset = require('./baseAsset');

/** */
class DocumentAsset extends BaseAsset {
    get ALLOWED_METADATA() {
        return new Set([...super.ALLOWED_METADATA, 'document_data']);
    }

    constructor(metadata = {}) {
        super(metadata);

        this._object_type = 'ArticleObject';
    }

    set_metadata(metadata) {
        super.set_metadata(metadata);

        Object.entries(metadata).forEach(([key, value]) => {
            if (key === 'document_data') {
                const { content_type, document_data } = value;
                this.set_document_data(content_type, document_data);
            }
        });
    }

    set_document_data(contentType, documentData) {
        this._content_type = contentType;
        this._document_data = documentData;
    }

    to_data() {
        return this._document_data;
    }
}

module.exports = DocumentAsset;
