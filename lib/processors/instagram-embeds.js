'use strict';

const _ = require('lodash');
const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));

const somaDOM = require('../somadom');
const utils = require('../utils');
const Asset = require('../asset');
const { createImageAsset } = require('./image-embeds');

const SHAREDDATA_REGEX = /window\._sharedData\s*=\s*({.+?});/;

function _obtainMediaInfo (html) {
    const imagesInfo = [];
    const videosInfo = [];

    // Try to extract a JSON from inside the HTML. Inspired by
    // youtube-dl video extractor.
    const found = html.match(SHAREDDATA_REGEX);
    if (!found) {
        return null;
    }

    const sharedData = JSON.parse(found[1]);
    const media = (
        _.get(sharedData, 'entry_data.PostPage.0.graphql.shortcode_media') ||
        _.get(sharedData, 'entry_data.PostPage.0.media')
    );

    if (!media) {
        return null;
    }

    if (media['video_url']) {
        videosInfo.push([media['video_url'], media['display_src']]);
    }

    const edges = _.get(media, 'edge_sidecar_to_children.edges');

    if (!edges) {
        return null;
    }

    for (const edge of edges) {
        const node = edge['node'];
        if (!node) {
            continue;
        }

        if (node['video_url']) {
            videosInfo.push([node['video_url'], node['display_url']]);
        } else {
            imagesInfo.push(node['display_url']);
        }
    }

    if (imagesInfo.length || videosInfo.length) {
        return { imagesInfo, videosInfo };
    }

    return null;
}

function _makeVideoAsset ({ videoUrl, thumbUrl, title, synopsis } = {}) {
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
    return asset;
}

function _processInstappPhoto ($block, $html) {
    const title = $html('meta[property="og:title"]').attr('content');
    const synopsis = $html('meta[property="og:description"]').attr('content');

    const media = _obtainMediaInfo($html.html());
    if (!media) {
        // Simplest case, only one image:
        const imageUrl = $html('meta[property="og:image"]').attr('content');
        const imageAsset = createImageAsset(imageUrl, synopsis);
        imageAsset.replaceWithAssetTag($block);

        return [imageAsset];
    }

    const assets = [];
    const $blockPlaceholder = cheerio('<div></div>');

    for (const imageUrl of media.imagesInfo) {
        const $imagePlaceholder = cheerio('<div></div>');
        $blockPlaceholder.append($imagePlaceholder);

        const imageAsset = createImageAsset(imageUrl, synopsis);
        assets.push(imageAsset);

        imageAsset.replaceWithAssetTag($imagePlaceholder);
    }

    for (const [videoUrl, thumbUrl] of media.videosInfo) {
        const $videoPlaceholder = cheerio('<div></div>');
        $blockPlaceholder.append($videoPlaceholder);

        const videoAsset = _makeVideoAsset({
            videoUrl, thumbUrl,
            title, synopsis,
        });

        videoAsset.replaceWithAssetTag($videoPlaceholder);
        assets.push(videoAsset);
    }

    $block.replaceWith($blockPlaceholder);
    return assets;
}

function _processVideo ($block, $html) {
    const asset = _makeVideoAsset({
        videoUrl: $html('meta[property="og:url"]').attr('content'),
        title: $html('meta[property="og:title"]').attr('content'),
        thumbUrl: $html('meta[property="og:image"]').attr('content'),
        synopsis: $html('meta[property="og:description"]').attr('content'),
    });

    asset.replaceWithAssetTag($block);
    return [asset];
}

async function processInstagramEmbeds ($body) {
    const assets = [];

    const $blockquotes = $body.find('blockquote.instagram-media');
    const promises = $blockquotes.map(async (i, elem) => {
        const $block = cheerio(elem);

        // Remove the Instagram icon:
        $block.find('svg').remove();

        const permalink = $block.attr('data-instgrm-permalink');

        const html = (await utils.request(permalink)).body;
        const $html = cheerio.load(html);

        const ogType = $html('meta[property="og:type"]').attr('content');

        if (ogType === 'instapp:photo') {
            const instappAssets = _processInstappPhoto($block, $html);
            assets.push(...instappAssets);
        }

        if (ogType === 'video') {
            const videoAssets = _processVideo($block, $html);
            assets.push(...videoAssets);
        }
    });

    await Promise.all(promises.get());

    return { $body, assets };
}

module.exports = {
    processInstagramEmbeds,
};
