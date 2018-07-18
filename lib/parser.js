'use strict';

const Asset = require('./asset');
const { ImplementationError } = require('./errors');

class Parser {
    constructor () {
        this.asset = new Asset();
    }

    async parse () {
        throw new ImplementationError('You have to implement Parser.parse');
    }
}

module.exports = Parser;
