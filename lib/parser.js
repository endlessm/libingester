'use strict';

const Asset = require('./asset');
const { ImplementationError } = require('./errors');

class Parser {
    constructor (uri) {
        this.uri = uri;
        this.asset = new Asset(uri);
    }

    async parse () {
        throw new ImplementationError('Parser.parse');
    }

    async renderAsset () {
        this.asset.setMetadata('document', this.asset.metadata.body);
    }
}

module.exports = Parser;
