'use strict';

const cheerio = require('cheerio-advanced-selectors').wrap(require('cheerio'));

const Asset = require('./asset');

class VideosProcessor {
    async process ($body) {
        const videoAssets = [];

        const youtubeIframes = $body('iframe').filter((i, elem) => {
            return cheerio(elem).attr('src').startsWith('https://www.youtube.com');
        });

        youtubeIframes.each((i, elem) => {
            const src = cheerio(elem).attr('src');
            if (!src) {
                cheerio(elem).remove();
                return;
            }

            const asset = new Asset();
            asset.setMetadata('objectType', 'VideoObject');
            asset.setMetadata('canonicalURI', src);
            // FIXME title, thumbnail
            videoAssets.push(asset);

            const placeholder = cheerio('<a></a>');
            placeholder.attr('data-soma-widget', 'VideoLink');
            placeholder.attr('data-libingester-asset-id', asset.id);
            placeholder.addClass('media-link video');
            cheerio(elem).replaceWith(placeholder);
        });

        return videoAssets;
    }
}

module.exports = VideosProcessor;
