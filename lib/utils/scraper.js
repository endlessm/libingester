'use strict';

const metascraper = require('metascraper');

const formatMetadata = require('./format-metadata');

const METASCRAPER_TO_LIBINGESTER = {
    'description': 'synopsis',
    'url': 'canonicalURI',
    'date': 'publishedDate',
    'publisher': 'source',
};

async function scraper (options) {
    const metadata = await metascraper(options);
    return formatMetadata(metadata, METASCRAPER_TO_LIBINGESTER);
}

module.exports = scraper;
