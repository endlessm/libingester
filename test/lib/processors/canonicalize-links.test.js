'use strict';

const libingester = require('../../../');

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const fs = require('fs-extra');
const path = require('path');

async function readHtml (name) {
    return fs.readFile(path.join(__dirname, name), 'utf8');
}

let $body;
describe('can canonicalize links', () => {
    beforeAll(async () => {
        // FIXME needed to initialize config and logger
        // eslint-disable-next-line no-new
        new libingester.WebIngester();
        const html = await readHtml('canonicalize-links.in.html');
        $body = cheerio.load(html).root();
    });

    test('with defaults', async () => {
        const expected = await readHtml('canonicalize-links.out.html');
        const baseUrl = 'https://example.com/CustomArticle';
        const result = libingester.processors.canonicalizeLinks($body, { baseUrl });
        expect(result.$body.html()).toBe(expected);
    });
});
