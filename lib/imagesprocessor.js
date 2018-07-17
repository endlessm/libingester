'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const url = require('url');

const somaDOM = require('./somadom');
const { downloadImage } = require('./utils/request');

class ImagesProcessor {
    static _getImageSource ($img, baseUri = '') {
        const src = $img.attr('src');
        if (src) {
            return url.resolve(baseUri, src);
        }

        const srcSet = $img.attr('srcset');
        if (srcSet) {
            const firstDecl = srcSet.split(',')[0];
            const firstUri = firstDecl.split(/\s+/)[0];
            return url.resolve(baseUri, firstUri);
        }

        const dataSrc = $img.attr('data-src');
        if (dataSrc) {
            return url.resolve(baseUri, dataSrc);
        }

        throw new Error('Could not parse img tag\'s src');
    }

    async process ($body) {
        const imageAssets = [];

        $body('img').each((i, elem) => {
            const $img = cheerio(elem);

            // FIXME case of data src

            const src = ImagesProcessor._getImageSource($img);
            const asset = downloadImage(src);
            imageAssets.push(asset);

            $img.attr('src', null);
            $img.attr('srcset', null);
            // FIXME original libingester does this, then replaces it:
            // $img.attr('data-libingester-asset-id', asset.id);
            $img.attr('data-soma-job-id', asset.id);
            $img.attr(somaDOM.Hint.Tag, somaDOM.Hint.ImportantImage);

            const $linkWrapper = cheerio('<a></a>');
            $linkWrapper.attr(somaDOM.Widget.Tag, somaDOM.Widget.ImageLink);

            $img.wrap($linkWrapper);
        });

        return imageAssets;
    }
}

module.exports = ImagesProcessor;
