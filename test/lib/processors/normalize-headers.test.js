'use strict';

const libingester = require('../../../');

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const fs = require('fs-extra');
const path = require('path');

async function readHtml (name) {
    return fs.readFile(path.join(__dirname, name), 'utf8');
}

let $body;
describe('can process headers', () => {
    beforeAll(async () => {
        // FIXME needed to initialize config and logger
        // eslint-disable-next-line no-new
        new libingester.WebIngester();
        const html = await readHtml('normalize-headers.in.html');
        $body = cheerio.load(html).root();
    });

    test('with defaults', async () => {
        const expected = await readHtml('normalize-headers.out-1.html');
        const result = libingester.processors.normalizeHeaders($body);
        expect(result.$body.html()).toBe(expected);
    });

    test('does not pass h6', async () => {
        const expected = await readHtml('normalize-headers.out-2.html');
        const result = libingester.processors.normalizeHeaders($body, { fromIndex: 5 });
        expect(result.$body.html()).toBe(expected);
    });
});
