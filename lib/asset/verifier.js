'use strict';

const fileType = require('file-type');
const Validator = require('validator');

const { logger } = require('../logging');

const MAX_TITLE_LENGTH = 140;

class VerificationError extends Error {
    constructor(message, metadata = null) {
        super(message);

        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);

        if (metadata) {
            this.metadata = metadata;
        }
    }
}

function assert(value, message, metadata = null) {
    if (value === true) {
        return;
    }

    throw new VerificationError(`${message}: ${value}`, metadata);
}

function verifyMetadata(metadata) {
    const objectType = metadata['objectType'];

    assert(metadata['assetID'].length === 40,
           'Asset has invalid assetID', metadata);

    assert(typeof metadata['canonicalURI'] === 'string',
           'Asset has invalid canonicalURI', metadata);

    assert(Boolean(metadata['matchingLinks']),
           'Asset missing matchingLinks', metadata);

    assert(metadata['matchingLinks'].every(s => (typeof s === 'string')),
           'Some asset matching URIs are not strings', metadata);

    assert(Boolean(metadata['tags']),
           'Asset missing tags', metadata);
    assert(metadata['tags'].every(s => (typeof s === 'string')),
           'Some asset tags are not strings', metadata);

    assert(Boolean(metadata['revisionTag']),
           'Asset missing revisionTag', metadata);

    if (objectType !== 'VideoObject') {
        assert(typeof metadata['contentType'] === 'string',
               'Asset has invalid contentType', metadata);
    }

    if (objectType === 'ArticleObject') {
        // XXX: This should be attached to stuff that can show up in sets/search
        assert(Boolean(metadata['title']), 'metadata missing title', metadata);
        if (metadata['title'].length > MAX_TITLE_LENGTH) {
            logger.warn(`Found a really long title! "${metadata['title'].length}"`, metadata);
        }
        assert(Boolean(metadata['document']), 'metadata missing document', metadata);
        assert(metadata['document'].length > 0, 'document is empty', metadata);
    } else if (objectType === 'ImageObject') {
        assert(Boolean(metadata['cdnFilename']),
               'Image object missing cdnFilename (has no data?)', metadata);
    } else if (objectType === 'DictionaryWordObject') {
        assert(Boolean(metadata['word']), 'metadata missing word', metadata);
        assert(Boolean(metadata['definition']), 'metadata missing definition', metadata);
    } else if (objectType === 'VideoObject') {
        assert(!metadata['contentType'],
               'Video object should have its contentType set later', metadata);
    } else {
        throw new VerificationError('metadata has wrong objectType', metadata);
    }
}

function verifyManifestEntry(entry) {
    if (entry.uri.startsWith('data:')) {
        return;
    }

    assert(Validator.isURL(entry.uri));
}

function verifyImageData(data) {
    const type = fileType(data);
    assert(Boolean(type), `Could not detect mimetype of image data ${data}`);
    assert(type.mime.startsWith('image/'), 'Data is not an image');
}

module.exports = {
    verify_image_data: verifyImageData,
    verify_manifest_entry: verifyManifestEntry,
    verify_metadata: verifyMetadata,
    VerificationError,
};
