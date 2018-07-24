'use strict';

const _ = require('lodash');
const sanitizeHtml = require('sanitize-html');

const SANITIZE_HTML_OPTIONS = {
    allowedTags: _(sanitizeHtml.defaults.allowedTags)
        .without('iframe')
        .concat('h2', 'img', 'libingester-asset')
        .value(),
    allowedAttributes: {
        '*': [ 'data-soma-*' ],
        'libingester-asset': ['data-id'],
        // a: [ 'href', 'name', 'target' ],
        // img: [ 'src' ]
    },
    selfClosing: [
        'img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta',
    ],
    // URL schemes we permit
    allowedSchemes: [ 'http', 'https', 'ftp', 'mailto' ],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: [ 'href', 'src', 'cite' ],
    allowProtocolRelative: true,
};

async function processCleanup ($body) {
    return { $body: sanitizeHtml($body.toString(), SANITIZE_HTML_OPTIONS) };
}

module.exports = {
    processCleanup,
};
