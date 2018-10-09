'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));

const somaDOM = require('../somadom');
const utils = require('../utils');
const Asset = require('../asset');
const { createImageAsset } = require('./image-embeds');

function _processImages ($block, $html) {
    const imageAssets = [];
    // FIXME differenciate title and synopsis (figcaption) in image assets
    // const title = $html('meta[property="og:title"]').attr('content');
    const synopsis = $html('meta[property="og:description"]').attr('content');

    const $placeholder = cheerio('<div></div>');

    // FIXME: All images should be inside a single figure with one
    // figcaption.
    $html('meta[property="og:image"]').each((i, elem) => {
        const $imagePlaceholder = cheerio('<div></div>');
        $placeholder.append($imagePlaceholder);

        const imageUrl = cheerio(elem).attr('content');
        const imageAsset = createImageAsset(imageUrl, synopsis);
        imageAssets.push(imageAsset);

        imageAsset.replaceWithAssetTag($imagePlaceholder);
    });

    $block.replaceWith($placeholder);
    return imageAssets;
}

function _processVideos ($block, $html) {
    const videoUrl = $html('meta[property="og:video:url"]').attr('content');
    const title = $html('meta[property="og:title"]').attr('content');
    const thumbUrl = $html('meta[property="og:image"]').attr('content');
    const synopsis = $html('meta[property="og:description"]').attr('content');

    const thumbnailAsset = createImageAsset(thumbUrl);

    const asset = new Asset(videoUrl);
    asset.setMetadata({
        objectType: Asset.VIDEO_OBJECT_TYPE,
        thumbnail: thumbnailAsset.id,
        title,
        synopsis,
    });

    asset.children.push(thumbnailAsset);

    const $placeholder = cheerio('<a></a>');
    $placeholder.attr(somaDOM.Widget.Tag, somaDOM.Widget.VideoLink);
    $placeholder.attr('data-libingester-asset-id', asset.id);
    $placeholder.addClass('media-link video');

    asset.setMetadata('body', $placeholder.toString());
    asset.replaceWithAssetTag($block);

    return [asset];
}

async function processTwitterEmbeds ($body) {
    const assets = [];

    const $blockquotes = $body.find('blockquote.twitter-tweet');

    const promises = $blockquotes.map(async (i, elem) => {
        const $block = cheerio(elem);
        const $picLinks = $block.find('a').filter((j, aElem) => {
            return cheerio(aElem).text().startsWith('pic.twitter.com');
        });

        if ($picLinks.length === 0) {
            // No images or videos to ingest. We leave the blockquote
            // as is.
            return;
        }

        const href = $picLinks.first().attr('href');
        const html = (await utils.request(href)).body;
        const $html = cheerio.load(html);

        const ogType = $html('meta[property="og:type"]').attr('content');

        if (ogType === 'article') {
            const imageAssets = _processImages($block, $html);
            assets.push(...imageAssets);
        }

        if (ogType === 'video') {
            const videoAssets = _processVideos($block, $html);
            assets.push(...videoAssets);
        }
    });

    await Promise.all(promises.get());

    return { $body, assets };
}

module.exports = {
    processTwitterEmbeds,
};
