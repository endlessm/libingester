'use strict';

/** @namespace config */

const fs = require('fs-extra');
const argv = require('argv-parse');


const CLI_OPTIONS = {
    'config-file': {
        type: 'string'
    },
    'no-tgz': {
        type: 'boolean'
    },
    'path': {
        type: 'string'
    },
    'urls': {
        type: 'array'
    },
    'max-retries': {
        type: 'string',
    },
    'retry-backoff-delay': {
        type: 'string',
    },
};

const DEFAULT_OPTIONS = {
    // Exponential wait: 800ms, 1600ms, 3200ms
    'max-retries': '3',
    'retry-backoff-delay': '800',
}

const _config = {};


/**
 * Unified place to Parse the options.
 *
 * The argument passing has the following priority:
 *
 *   1. options.argv passed as parameter.
 *
 *   2. arguments passed to the command line. If 1. is passed, these
 *      arguments get fully overriden.
 *
 *   3. a JSON config file with options inside. Must be passed in 2.
 *      or 1. as `--config-file`. If more options are passed, they
 *      each override the same option if it is declared in the config
 *      file.
 *
 * @param {Object} options [{}] - A dictionary with options
 * @param {Array} options.argv - An array of arguments. Defaults to
 *   the command-line arguments passed to the process.
 *  - '--path' - Use a filesystem path different than the default in the working directory
 *  - '--no-tgz' - Whether to skip compressing the hatch (see
 *   {@link Hatch#is_exporting_tgz})
 *  - '--urls' - Stores an array of URLs that {@link Hatch#get_urls}
 *    can return.
 *  - '--config-file' - A JSON config file with options inside. See above.
 * @memberof config
 */
function parse_options(options) {
    options = options || {};

    const argv_options = options.argv || process.argv.slice(2);
    const cli_options = argv(CLI_OPTIONS, argv_options);

    let configfile_options = {};
    if (cli_options['config-file']) {
        const cf = cli_options['config-file'];
        configfile_options = fs.readJsonSync(cf);
    }

    Object.assign(_config, DEFAULT_OPTIONS, options, configfile_options,
                  cli_options);
}

exports.parse_options = parse_options;


/**
 *
 * Get one setting.
 *
 * @param {string} setting - The setting name
 * @returns {any} - The setting value
 * @memberof config
 */
function get_setting(setting) {
    if (_config) {
        return _config[setting];
    }
}

exports.get_setting = get_setting;

function clean() {
    Object.keys(_config).forEach(function (key) { delete _config[key]; });
}

exports.clean = clean;
