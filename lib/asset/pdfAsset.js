'use strict';

const BaseAsset = require('./baseAsset');

/** */
class PdfAsset extends BaseAsset {
    get ALLOWED_METADATA() {
        return new Set([...super.ALLOWED_METADATA, 'pdf_data']);
    }

    constructor(metadata = {}) {
        super(metadata);

        this._object_type = 'ArticleObject';
        this._content_type = 'application/pdf';
    }

    set_metadata(metadata) {
        super.set_metadata(metadata);

        Object.entries(metadata).forEach(([key, value]) => {
            if (key === 'pdf_data') {
                const { content_type, pdf_data } = value;
                this.set_pdf_data(content_type, pdf_data);
            }
        });
    }

    set_pdf_data(contentType, pdfData) {
        this._content_type = contentType;
        this._pdf_data = pdfData;
    }

    to_data() {
        return this._pdf_data;
    }
}

module.exports = PdfAsset;
