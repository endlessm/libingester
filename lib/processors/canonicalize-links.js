'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const url = require('url');

function canonicalizeLinks ($body, { baseUrl = null } = {}) {
    $body.find('a').each((i, elem) => {
        const $elem = cheerio(elem);
        const href = $elem.attr('href');
        if (href && !href.startsWith('#')) {
            $elem.attr('href', url.resolve(baseUrl, href));
        }
    });

    return { $body };
}

module.exports = {
    canonicalizeLinks,
};
