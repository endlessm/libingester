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
            tags: [],
            revisionTag: new Date().toISOString(),
        };
        this.data = null;
        this.children = [];
    }

    _newAssetId () {
        const hash = crypto.createHash('sha1');
        hash.update(crypto.randomBytes(32));
        return hash.digest('hex');
    }
}

module.exports = Asset;
