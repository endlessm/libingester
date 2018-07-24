'use strict';

const sanitizeHtml = require('sanitize-html');

const CLEANUP_OPTIONS = {
    allowedTags: [
        'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'img',
        'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
        'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre',
    ],
    allowedAttributes: {
        '*': [ 'data-soma-*' ],
        // a: [ 'href', 'name', 'target' ],
        // img: [ 'src' ]
    },
    // Lots of these won't come up by default because we don't
    // allow them
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
    return { $body: sanitizeHtml($body.html(), CLEANUP_OPTIONS) };
}

module.exports = {
    processCleanup,
};
