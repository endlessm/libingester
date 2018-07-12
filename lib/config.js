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
            .option('retry-backoff-delay', {
                type: 'number',
                default: 800,
            })
            .group(['ingest-pool-size', 'max-retries', 'retry-backoff-delay'],
                   'Flow control:')
            .option('max-items', {
                type: 'number',
                default: Infinity,
            })
            .option('max-days-old', {
                type: 'number',
                default: 1,
            })
            .group(['max-items', 'max-days-old'], 'Limiting ingestion:')
            .option('path', {
                type: 'string',
                default: null,
            })
            .option('tgz', {
                type: 'boolean',
                default: false,
            })
            .group(['path', 'tgz'], 'Output:')
            .option('urls', {
                type: 'array',
            })
            .group(['urls'], 'Input:')
            .option('verbose', {
                alias: 'v',
                count: true,
            })
            .option('hatch-v2', {
                type: 'boolean',
                default: false,
            })
            .group(['hatch-v2'], 'Developer only options:')
            .argv;
    }
}

module.exports = new Config();
