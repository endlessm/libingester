'use strict';

const _ = require('lodash');
const crypto = require('crypto');
const validator = require('validator');

const config = require('./config');

function _coerce (s) {
    if (s === null) {
        return '';
    }
    return `${s}`;
}

/**
 * Asset class.
 *
 * This is the result of any ingested unit of content. It's a
 * container for the content data and metadata. For example an
 * article, a video, an image.
 *
 * If data is left unset, it is expected to be filled up later in the
 * pipeline. In that case, metadata.contentType can be left unset
 * too. An example of this is a video that will be downloaded later
 * from the canonicalURI.
 *
 * The metadata that is always required is: canonicalURI, objectType,
 * and contentType (the latter with one exception, see above). The
 * rest of the metadata will be required or not, depending on the
 * objectType.
 *
 * When setting metadata, the input will be sanitized, depending on
 * the kind of metadata. For example, setting title will remove line
 * breaks and extra white spaces from the input.
 *
 * An asset can have other assets as children, and thus forming a tree
 * of assets. For example, an article that has videos and images, and
 * the videos inside have images as thumbnails.
 *
 * An asset can be validated using validate(). This will check:
 *
 * - If each metadata is valid.
 * - If the parser marked the asset invalid.
 * - If any of its decendent children are invalid.
 *
 * There are validators for each metadata. A Parser can mark the asset
 * as invalid by adding custom failures with addCustomFailure(). The
 * result of calling validate() is an error object with information of
 * all the checks that failed.
 *
 */
class Asset {
    constructor (canonicalURI) {
        this.metadata = {
            assetID: this._newAssetId(),
            objectType: null,
            contentType: null,
            canonicalURI: canonicalURI,
            matchingLinks: [],
            title: null,
            publishedDate: new Date().toISOString(),
            lastModifiedDate: new Date().toISOString(),
            synopsis: null,
            license: 'Proprietary',
            source: null,
            tags: [],
            authors: [],
            sequenceNumber: null,
            thumbnail: null,
            revisionTag: new Date().toISOString(),
            body: null,
            readMoreLink: null,
            readMoreText: null,
        };
        this.data = null;
        this.children = [];
        this._customFailures = [];
    }

    _newAssetId () {
        const hash = crypto.createHash('sha1');
        hash.update(crypto.randomBytes(32));
        return hash.digest('hex');
    }

    get id () {
        return this.metadata.assetID;
    }

    _sanitizeText (value) {
        return validator.trim(_coerce(value));
    }

    sanitizeTitle (value) {
        return this._sanitizeText(value);
    }

    sanitizeAuthorsItem (value) {
        return this._sanitizeText(value);
    }

    sanitizeTagsItem (value) {
        return this._sanitizeText(value);
    }

    // FIXME add more sanitizers

    _sanitizeMetadataValue (name, value) {
        let sanitizeMethodName;

        if (Array.isArray(this.metadata[name])) {
            sanitizeMethodName = `sanitize${_.upperFirst(name)}Item`;
        } else {
            sanitizeMethodName = `sanitize${_.upperFirst(name)}`;
        }

        if (_.isFunction(this[sanitizeMethodName])) {
            const sanitized = this[sanitizeMethodName](value);
            return sanitized;
        }

        return value;
    }

    _setMetadataValue (name, value) {
        switch (name) {
        case 'canonicalURI':
            if (!this.metadata.matchingLinks.includes(value)) {
                this.addMetadataValue('matchingLinks', value);
            }
            this.metadata.canonicalURI = value;
            break;
        default:
            this.metadata[name] = this._sanitizeMetadataValue(name, value);
        }
    }

    addMetadataValue (name, value) {
        if (!Array.isArray(this.metadata[name])) {
            throw new Error(
                `Cannot call Asset.addMetadataValue for "${name}", which is not an Array`);
        }

        this.metadata[name].push(this._sanitizeMetadataValue(name, value));
    }

    setMetadata (nameOrObject, value) {
        if (_.isPlainObject(nameOrObject)) {
            for (const name of Object.keys(nameOrObject)) {
                this._setMetadataValue(name, nameOrObject[name]);
            }
        } else {
            this._setMetadataValue(nameOrObject, value);
        }
    }

    getChildById (id) {
        return this.children.find(child => {
            return child.id === id;
        });
    }

    getAssetTag () {
        return `<libingester-asset data-libingester-id="${this.id}" />`;
    }

    replaceWithAssetTag ($elementToReplace) {
        $elementToReplace.replaceWith(this.getAssetTag());
    }

    addCustomFailure (message) {
        this._customFailures.push(message);
    }

    validateCanonicalURI (value) {
        const errors = [];

        if (validator.isEmpty(_coerce(value))) {
            errors.push('Can\'t be empty');
        }

        // FIXME can also be validator.isDataURI ?
        if (!validator.isURL(_coerce(value))) {
            errors.push('Must be a valid URL');
        }

        return errors;
    }

    validateContentType (value) {
        const errors = [];

        if (this.metadata.objectType !== Asset.VIDEO_OBJECT_TYPE) {
            if (validator.isEmpty(_coerce(value))) {
                errors.push('Can\'t be empty');
            }
        }

        if (value !== null && !validator.isMimeType(_coerce(value))) {
            errors.push('Must be a valid MIME type');
        }

        return errors;
    }

    validateTitle (value) {
        const errors = [];

        if (this.metadata.objectType === Asset.ARTICLE_OBJECT_TYPE) {
            if (value === '') {
                errors.push('Article title can\'t be empty');
            }

            if (value.length > config.maxTitleLength) {
                errors.push('Article title is too long, ' +
                            `it should be ${config.maxTitleLength} characters max.`);
            }
        }

        return errors;
    }

    validateMatchingLinks (value) {
        const errors = [];

        for (const link of value) {
            if (!validator.isURL(_coerce(link))) {
                errors.push('Must contain valid URLs');
                break;
            }
        }

        return errors;
    }

    // FIXME add more validators

    validate () {
        if (typeof this._errors !== 'undefined') {
            return this._errors;
        }

        const errors = {};

        for (const child of this.children) {
            if (child.validate() !== null) {
                this._customFailures.push('Has failed children');
                break;
            }
        }

        if (!_.isEmpty(this._customFailures)) {
            errors['custom'] = this._customFailures;
        }

        for (const [name, value] of Object.entries(this.metadata)) {
            const validateMethodName = `validate${_.upperFirst(name)}`;
            if (_.isFunction(this[validateMethodName])) {
                const errorsForName = this[validateMethodName](value);
                if (!_.isEmpty(errorsForName)) {
                    errors[name] = errorsForName;
                }
            }
        }

        if (_.isEmpty(errors)) {
            this._errors = null;
        } else {
            this._errors = errors;
        }

        return this._errors;
    }

    flattenAssetTree () {
        let allAssets = [this];

        for (const child of this.children) {
            allAssets = allAssets.concat(child.flattenAssetTree());
        }

        return allAssets;
    }

    async finish () {
        await Promise.resolve(this.data);
    }
}

Asset.ARTICLE_OBJECT_TYPE = 'ArticleObject';
Asset.IMAGE_OBJECT_TYPE = 'ImageObject';
Asset.VIDEO_OBJECT_TYPE = 'VideoObject';

module.exports = Asset;
