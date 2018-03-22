'use strict';

const Validator = require('validator');
const FileType = require('file-type');
const {logger} = require('./logging');

const MAX_TITLE_LENGTH = 140;

class VerificationError extends Error {
    constructor (message, metadata=null) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
        if (metadata) {
            this.metadata = metadata;
        }
    }
}

exports.VerificationError = VerificationError;

function assert(value, message, metadata=null) {
    if (value) {
        return;
    }
    throw new VerificationError(`${message}: ${value}`, metadata);
}

function verify_metadata(metadata) {
    let object_type = metadata['objectType'];

    assert((metadata['assetID'].length === 40), "Asset has invalid assetID", metadata);
    assert(typeof metadata['canonicalURI'] === "string", "Asset has invalid canonicalURI", metadata);

    assert(!!metadata['matchingLinks'], "Asset missing matchingLinks", metadata);
    assert(metadata['matchingLinks'].every((s) => (typeof s === "string")), "Some asset matching URIs are not strings", metadata);

    assert(!!metadata['tags'], "Asset missing tags", metadata);
    assert(metadata['tags'].every((s) => (typeof s === "string")), "Some asset tags are not strings", metadata);

    assert(!!metadata['revisionTag'], "Asset missing revisionTag", metadata);

    if (object_type !== 'VideoObject')
        assert(typeof metadata['contentType'] === "string", "Asset has invalid contentType", metadata);

    if (object_type === 'ArticleObject') {
        // XXX: This should be really attached to stuff that can show up in sets / search
        assert(!!metadata['title'], "metadata missing title", metadata);
        if (metadata['title'].length > MAX_TITLE_LENGTH) {
            logger.warn(`Found a really long title! "${metadata['title'].length}"`, metadata);
        }
        assert(!!metadata['document'], "metadata missing document", metadata);
        assert(metadata['document'].length > 0, "document is empty", metadata);
    } else if (object_type === 'ImageObject') {
        assert(!!metadata['cdnFilename'], "Image object missing cdnFilename (has no data?)", metadata);
    } else if (object_type === "DictionaryWordObject") {
        assert(!!metadata['word'], "metadata missing word", metadata);
        assert(!!metadata['definition'], "metadata missing definition", metadata);
    } else if (object_type === 'VideoObject') {
        assert(!metadata['contentType'], "Video object should have its contentType set later", metadata);
    } else {
        throw new VerificationError("metadata has wrong objectType", metadata);
    }
}

exports.verify_metadata = verify_metadata;

function verify_manifest_entry (entry) {
    if (entry.uri.startsWith('data:'))
        return true;
    assert(Validator.isURL(entry.uri));
}

exports.verify_manifest_entry = verify_manifest_entry;

function verify_image_data (data) {
    const type = FileType(data);
    assert(!!type, `couldn't detect mimetype of image data ${data}`);
    assert(type.mime.startsWith('image/'), "data is not an image");
}

exports.verify_image_data = verify_image_data;
