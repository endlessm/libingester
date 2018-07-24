'use strict';

const _ = require('lodash');
const crypto = require('crypto');

class Asset {
    constructor () {
        this.metadata = {
            assetID: this._newAssetId(),
            objectType: null,
            contentType: null,
            canonicalURI: null,
            matchingLinks: [],
            title: null,
            publishedDate: new Date().toISOString(),
            lastModifiedDate: new Date().toISOString(),
            synopsis: null,
            license: 'Propietary',
            source: null,
            tags: [],
            authors: [],
            sequenceNumber: null,
            thumbnail: null,
            revisionTag: new Date().toISOString(),
            body: null,
        };
        this.data = null;
        this.failed = false;
        this.children = [];
    }

    _newAssetId () {
        const hash = crypto.createHash('sha1');
        hash.update(crypto.randomBytes(32));
        return hash.digest('hex');
    }

    get id () {
        return this.metadata.assetID;
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
            this.metadata[name] = value;
        }
    }

    addMetadataValue (name, value) {
        if (!Array.isArray(this.metadata[name])) {
            throw new Error(
                `Cannot call Asset.addMetadataValue for "${name}", which is not an Array`);
        }

        this.metadata[name].push(value);
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
        return `<libingester-asset data-id="${this.id}" />`;
    }

    replaceWithAssetTag ($elementToReplace) {
        $elementToReplace.replaceWith(this.getAssetTag());
    }

    isValid () {
        // TODO: Validate metadata fields
        return !this.failed;
    }

    isValidTree () {
        if (!this.isValid()) {
            return false;
        }

        for (const child of this.children) {
            if (!child.isValidTree()) {
                return false;
            }
        }

        return true;
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
