'use strict';

const libingester = require('../../../');

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const fs = require('fs-extra');
const path = require('path');

async function readHtml (name) {
    return fs.readFile(path.join(__dirname, name), 'utf8');
}

let $body;
describe('can cleanup', () => {
    beforeAll(async () => {
        // FIXME needed to initialize config and logger
        // eslint-disable-next-line no-new
        new libingester.WebIngester();
        const html = await readHtml('cleanup.in.html');
        $body = cheerio.load(html).root();
    });

    test('with defaults', async () => {
        const expected = await readHtml('cleanup.out-1.html');
        const result = libingester.processors.processCleanup($body, { useDefaults: true });
        expect(result.$body.html().replace(/\s/g, '')).toBe(expected.replace(/\s/g, ''));
    });

    test('can extend defaults', async () => {
        const expected = await readHtml('cleanup.out-2.html');
        const result = libingester.processors.processCleanup($body, { options: {
            remove: ['h2'],
            removeAttrs: { 'p': ['id'] },
        }, useDefaults: true });
        expect(result.$body.html().replace(/\s/g, '')).toBe(expected.replace(/\s/g, ''));
    });
});
