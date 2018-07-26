'use strict';

const yargs = require('yargs');

const NOW = new Date();

class Config {
    constructor () {
        this.args = null;
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
            .option('headless-browser', {
                type: 'boolean',
                default: false,
            })
            .group(['ingest-pool-size', 'max-retries', 'retry-backoff-delay', 'headless-browser'],
                   'Flow control:')
            .option('max-items', {
                type: 'number',
                default: Infinity,
            })
            .option('max-days-old', {
                type: 'number',
                default: 1,
            })
            .option('from-date', {
                type: 'string',
            })
            .option('to-date', {
                type: 'string',
                // eslint-disable-next-line func-name-matching
                default: () => NOW,
            })
            .coerce(['from-date', 'to-date'], date => new Date(date))
            .check(argv => {
                if (!argv.fromDate && argv.toDate.toISOString() !== NOW.toISOString()) {
                    throw (new Error('Please provide --from-date'));
                }
                if (argv.fromDate && argv.maxDaysOld !== 1) {
                    throw (new Error('--max-days-old and --from-date are mutually exclusive.'));
                }
                return true;
            })
            .group(['max-items', 'max-days-old', 'from-date', 'to-date'], 'Limiting ingestion:')
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
            .option('cache-requests', {
                type: 'boolean',
                default: false,
            })
            .option('reuse-hatch', {
                type: 'boolean',
                default: false,
            })
            .option('live-mode', {
                type: 'boolean',
                default: false,
            })
            .group(['hatch-v2', 'cache-requests', 'reuse-hatch', 'live-mode'],
                   'Developer options:');
    }

    parse () {
        this.args = this.config.argv;

        if (this.args.liveMode) {
            this.args.cacheRequests = this.args['cache-requests'] = true;
            this.args.reuseHatch = this.args['reuse-hatch'] = true;
        }

        if (!this.args.fromDate && this.args.maxDaysOld) {
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - this.args.maxDaysOld);
            this.args.fromDate = this.args['from-date'] = fromDate;
        }

        delete this.args.maxDaysOld;
    }
}

const configHandler = {
    get: (target, prop) => {
        if (target[prop]) {
            return target[prop];
        }

        return target.args[prop];
    },
};

module.exports = new Proxy(new Config(), configHandler);
