'use strict';

const url = require('url');
const cheerio = require('cheerio');

// Date formatting is awful in JS but using a lib was too heavy
function getTimestamp() {
    const date = new Date();

    const padNumber = value => String(value).padStart(2, '0');

    const year = date.getFullYear();
    const month = padNumber(date.getMonth() + 1);
    const day = padNumber(date.getDate());
    const hour = padNumber(date.getHours());
    const minute = padNumber(date.getMinutes());
    const second = padNumber(date.getSeconds());

    return `${year}${month}${day}_${hour}${minute}${second}`;
}

function ensureCheerio(value) {
    if (typeof value === 'string') {
        return cheerio.load(value);
    }
    return value;
}

function fixLinkTargets(content) {
    // Ingested content is meant for single window (no frames, no
    // tabs). So none of the target options are useful.
    //
    // Note: this is already covered by the cleanup_body() utility,
    // but not all ingesters use it.
    cheerio('a', content).removeAttr('target');
    return content;
}

function fixRelativeLinks(content, canonicalURL) {
    cheerio('a', content).each((index, elem) => {
        const $elem = cheerio(elem);
        const href = $elem.attr('href');
        if (href && !href.startsWith('#')) {
            $elem.attr('href', url.resolve(canonicalURL, href));
        }
    });
    return content;
}

function fixLinks(content, canonicalURL) {
    return fixLinkTargets(fixRelativeLinks(ensureCheerio(content), canonicalURL));
}

module.exports = {
    ensureCheerio,
    fixLinks,
    fixLinkTargets,
    getTimestamp,
};
