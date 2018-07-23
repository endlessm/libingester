'use strict';

const metascraper = require('metascraper');

const METASCRAPER_TO_LIBINGESTER = {
    'description': 'synopsis',
    'url': 'canonicalURI',
    'date': 'publishedDate',
    'publisher': 'source',
};

function _formatMetadata (obj) {
    for (const [oldKey, newKey] of Object.entries(METASCRAPER_TO_LIBINGESTER)) {
        if (oldKey in obj) {
            obj[newKey] = obj[oldKey];
            delete obj[oldKey];
        }
    }
    return obj;
}

async function scraper (options) {
    const metadata = await metascraper(options);
    return _formatMetadata(metadata);
}

module.exports = scraper;
