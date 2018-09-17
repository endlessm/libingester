'use strict';

function normalizeHeaders ($body, { fromIndex = 2 } = {}) {
    const headers = new Map();
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        const $h = $body.find(h);
        if ($h.length) {
            headers.set(h, $h);
        }
    }

    // limit the fromIndex to avoid passing h6
    const startIndex = Math.min(fromIndex, 7 - Array.from(headers).length);

    let curIndex = startIndex;
    for (const [oldH, $h] of headers) {
        const newH = `h${curIndex}`;
        if (oldH !== newH) {
            $h.each((i, item) => (item.tagName = newH));
        }
        curIndex += 1;
    }

    return { $body };
}

module.exports = {
    normalizeHeaders,
};
