'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const url = require('url');

const Asset = require('../asset');
const somaDOM = require('../somadom');
const { createImageAsset } = require('./image-embeds');

const YOUTUBE_EMBED_DOMAINS = [
    'youtube.com',
    'www.youtube.com',
    'www.youtube-nocookie.com',
];

const YOUTUBE_THUMBNAIL_BASE_URI = 'http://img.youtube.com/vi/';

function createYoutubeThumbnailAsset (embedUrl) {
    const parsed = url.parse(embedUrl);
    const isYoutube = YOUTUBE_EMBED_DOMAINS.includes(parsed.hostname);
    if (isYoutube && parsed.pathname.includes('/embed/')) {
        const path = `${parsed.pathname.replace('/embed/', '')}/0.jpg`;
        const imgUrl = url.resolve(YOUTUBE_THUMBNAIL_BASE_URI, path);

        return createImageAsset(imgUrl);
    }

    return null;
}

function processYoutubeEmbeds ($body) {
    const videoAssets = [];

    const youtubeIframes = $body.find('iframe').filter((i, elem) => {
        return cheerio(elem).attr('src').startsWith('https://www.youtube.com');
    });

    youtubeIframes.each((i, elem) => {
        const $iframe = cheerio(elem);
        const src = $iframe.attr('src');
        if (!src) {
            $iframe.remove();
            return;
        }

        const asset = new Asset();
        // FIXME title
        asset.setMetadata({
            objectType: Asset.VIDEO_OBJECT_TYPE,
            canonicalURI: src,
        });
        videoAssets.push(asset);

        const thumbnailAsset = createYoutubeThumbnailAsset(src);
        if (thumbnailAsset) {
            asset.setMetadata('thumbnail', thumbnailAsset.id);
            asset.children.push(thumbnailAsset);
        }

        const $placeholder = cheerio('<a></a>');
        $placeholder.attr(somaDOM.Widget.Tag, somaDOM.Widget.VideoLink);
        $placeholder.attr('data-libingester-asset-id', asset.id);
        $placeholder.addClass('media-link video');

        asset.setMetadata('body', $placeholder.toString());

        asset.replaceWithAssetTag($iframe);
    });

    return { $body, assets: videoAssets };
}

module.exports = {
    processYoutubeEmbeds,
};
