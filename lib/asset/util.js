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
    // Ingested content is meant for single window (no frames, no
    // tabs). So none of the target options are useful.
    cheerio('a', content).removeAttr('target');
    return content;
}


module.exports = {
    ensureCheerio,
    fixLinkTargets,
    getTimestamp,
};
