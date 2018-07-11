'use strict';

const yargs = require('yargs');

class Config {
    constructor () {
        this.config = yargs.strict()
            .config()
            .option('ingest-pool-size', {
                type: 'number',
                default: 5,
            })
            .option('max-retries', {
                type: 'number',
                default: 3,
            })
            .option('max-items', {
                type: 'number',
                default: Infinity,
            })
            .option('max-days-old', {
                type: 'number',
                default: 1,
            })
            .option('path', {
                type: 'string',
                default: null,
            })
            .option('retry-backoff-delay', {
                type: 'number',
                default: 800,
            })
            .option('tgz', {
                type: 'boolean',
                default: false,
            })
            .option('urls', {
                type: 'array',
            })
            .option('verbose', {
                type: 'boolean',
                default: false,
            })
            .argv;
    }
}

module.exports = new Config();
