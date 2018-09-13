'use strict';

const utils = require('../utils');

function processCleanup ($body, { options = {}, useDefaults = false } = {}) {
    let realOptions = options;
    if (!useDefaults) {
        realOptions = {
            ...utils.cleanupHtmlEmptyDefaults,
            ...options,
        };
    }

    utils.cleanupHtml($body, realOptions);
    return { $body };
}

module.exports = {
    processCleanup,
};
