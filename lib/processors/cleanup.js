'use strict';

const utils = require('../utils');

function processCleanup (options = {}, useDefaults = false) {
    return $body => {
        let realOptions = options;
        if (!useDefaults) {
            realOptions = {
                ...utils.cleanupHtmlEmptyDefaults,
                ...options,
            };
        }

        utils.cleanupHtml($body, realOptions);
        return { $body };
    };
}

module.exports = {
    processCleanup,
};
