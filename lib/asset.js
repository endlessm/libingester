'use strict';

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
            synopsys: null,
            license: null,
            publishedDate: new Date().toISOString(),
            lastModifiedDate: new Date().toISOString(),
            tags: [],
            revisionTag: new Date().toISOString(),
            sequenceNumber: null,
            thumbnail: null,
        };
        this.data = null;
        this.children = [];
    }

    _newAssetId () {
        const hash = crypto.createHash('sha1');
        hash.update(crypto.randomBytes(32));
        return hash.digest('hex');
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
        if (nameOrObject !== null && typeof nameOrObject === 'object') {
            for (const name of Object.keys(nameOrObject)) {
                this._setMetadataValue(name, nameOrObject[name]);
            }
        } else {
            this._setMetadataValue(nameOrObject, value);
        }
    }

}

module.exports = Asset;
