// eslint-disable-next-line no-nested-ternary
'use strict';

/** @namespace config */

const argv = require('argv-parse');
const fs = require('fs-extra');


const CLI_OPTIONS = {
    'config-file': {
        type: 'string',
    },
    'no-tgz': {
        type: 'boolean',
    },
    'path': {
        type: 'string',
    },
    'urls': {
        type: 'array',
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
};

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
 *  - '--path' - Use filesystem path different than default in working dir
 *  - '--no-tgz' - Whether to skip compressing the hatch (see
 *   {@link Hatch#is_exporting_tgz})
 *  - '--urls' - Stores an array of URLs that {@link Hatch#get_urls}
 *    can return.
 *  - '--config-file' - A JSON config file with options inside. See above.
 * @memberof config
 */
function parseOptions(options = {}) {
    const argvOptions = options.argv || process.argv.slice(2);
    const cliOptions = argv(CLI_OPTIONS, argvOptions);

    let configFileOptions = {};
    if (cliOptions['config-file']) {
        const configFilePath = cliOptions['config-file'];
        configFileOptions = fs.readJsonSync(configFilePath);
    }

    Object.assign(_config, DEFAULT_OPTIONS, options, configFileOptions,
                  cliOptions);
}


/**
 *
 * Get one setting.
 *
 * @param {string} setting - The setting name
 * @returns {any} - The setting value
 * @memberof config
 */
function getSetting(setting) {
    if (_config) {
        return _config[setting];
    }

    return null;
}

function clean() {
    Object.keys(_config).forEach(key => {
        delete _config[key];
    });
}

module.exports = {
    clean,
    get_setting: getSetting,
    parse_options: parseOptions,
};
