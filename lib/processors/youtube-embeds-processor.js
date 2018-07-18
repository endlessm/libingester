'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));
const url = require('url');

const Asset = require('../asset');
const somaDOM = require('../somadom');
const { downloadImage } = require('../utils/request');

const YOUTUBE_EMBED_DOMAINS = [ 'youtube.com',
                                'www.youtube.com',
                                'www.youtube-nocookie.com' ];

function _downloadYoutubeThumbnail (embedUrl) {
    const parsed = url.parse(embedUrl);
    const isYoutube = YOUTUBE_EMBED_DOMAINS.includes(parsed.hostname);
    if (isYoutube && parsed.pathname.includes('/embed/')) {
        const thumb = '/0.jpg';
        const path = parsed.pathname.replace('/embed/', '') + thumb;
        const baseUrlImg = 'http://img.youtube.com/vi/';
        const imgUrl = url.resolve(baseUrlImg, path);

        return downloadImage(imgUrl);
    }

    return null;
}

function processYoutubeEmbeds ($body) {
    const videoAssets = [];

    const youtubeIframes = $body('iframe').filter((i, elem) => {
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
            objectType: 'VideoObject',
            canonicalURI: src,
        });
        videoAssets.push(asset);

        const thumbAsset = _downloadYoutubeThumbnail(src);
        if (thumbAsset) {
            asset.setMetadata('thumbnail', thumbAsset.id);
            asset.children.push(thumbAsset);
        }

        const $placeholder = cheerio('<a></a>');
        $placeholder.attr(somaDOM.Widget.Tag, somaDOM.Widget.VideoLink);
        $placeholder.attr('data-libingester-asset-id', asset.id);
        $placeholder.addClass('media-link video');
        $iframe.replaceWith($placeholder);
    });

    return videoAssets;
}


module.exports = {
    processYoutubeEmbeds,
};
