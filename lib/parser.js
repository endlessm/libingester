'use strict';

const Asset = require('./asset');

class Parser {
    constructor () {
        this.asset = new Asset();
    }

    async parse () {
        throw new Error('You have to implement Parser.parse');
    }
}

module.exports = Parser;
