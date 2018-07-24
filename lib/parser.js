'use strict';

const Asset = require('./asset');
const { ImplementationError } = require('./errors');

class Parser {
    constructor () {
        this.asset = new Asset();
    }

    async parse () {
        throw new ImplementationError('Parser.parse');
    }

    async renderAsset () {
        this.asset.setMetadata('document', this.asset.metadata.body);
    }
}

module.exports = Parser;
