'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const imageType = require('image-type');
const url = require('url');

const somaDOM = require('../somadom');
const utils = require('../utils');
const Asset = require('../asset');

function getImageSource ($img, baseUri = '') {
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

function createImageAsset (uri, caption) {
    const asset = new Asset();

    asset.setMetadata({
        objectType: Asset.IMAGE_OBJECT_TYPE,
        canonicalURI: uri,
        title: caption,
    });

    const $body = cheerio(
        `<figure>
            <a ${somaDOM.Widget.Tag}="${somaDOM.Widget.ImageLink}">
                <img src="${uri}"
                     data-soma-job-id="${asset.id}"
                     ${somaDOM.Hint.Tag}="${somaDOM.Hint.ImportantImage}" />
            </a>
        </figure>`);
    if (caption) {
        $body.append(
            `<figcaption>
                <p>${caption}</p>
            </figcaption>`
        );
    }
    asset.setMetadata('body', $body.toString());

    asset.data = utils.request(uri);

    asset.data.then(response => {
        let contentType = response.headers['content-type'];
        if (!contentType.match(/^image/i)) {
            contentType = imageType(response.body);
            if (!contentType) {
                throw new Error(
                    `Request for image ${uri} resulted in a ` +
                    `non-image: ${response.headers['content-type']}`);
            }
        }

        asset.setMetadata('contentType', contentType);
        asset.data = response.body;
    });

    return asset;
}

async function processImages ($body) {
    const imageAssets = [];

    $body.find('img').each((i, elem) => {
        const $img = cheerio(elem);

        const src = getImageSource($img);
        const asset = createImageAsset(src, null);
        asset.replaceWithAssetTag($img);

        imageAssets.push(asset);
    });

    return { $body, assets: imageAssets };
}

module.exports = {
    getImageSource,
    createImageAsset,
    processImages,
};
