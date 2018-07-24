'use strict';

const puppeteer = require('puppeteer');

const logger = require('../logger');

// FIXME make it a class and reuse browser instance for all fetches
async function browserFetch (uri) {
    logger.info(`Fetching HTML (with browser) ${uri}`);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(uri);

    // eslint-disable-next-line no-undef
    const html = await page.evaluate(() => document.documentElement.outerHTML);

    await browser.close();
    return html;
}

module.exports = {
    browserFetch,
};
