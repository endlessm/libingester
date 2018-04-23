'use strict';

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
    // External links with target="_blank" won't open in default
    // browser
    cheerio('a[target="_blank"]', content).removeAttr('target');
    return content;
}


module.exports = {
    ensureCheerio,
    fixLinkTargets,
    getTimestamp,
};
