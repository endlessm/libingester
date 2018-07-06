'use strict';

const yargs = require('yargs');

const YARGS_CONFIG = yargs.strict()
      .option('config-file', {
          config: true,
      })
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
      });

class Config {
    parse () {
        return YARGS_CONFIG.parse();
    }
}

const config = new Config().parse();

module.exports = config;
