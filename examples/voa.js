'use strict';

const libingester = require('libingester');
const url = require('url');

function ingestVideo(hatch, uri) {
    return libingester.util.fetch_html(uri).then($videoPage => {
        const downloadLinks = $videoPage('.media-download li.subitem a');
        const videoDownloads = {};

        downloadLinks.each(function () {
            const $a = $videoPage(this);
            // Formatted as "quality | filesize";
            const title = $a.attr('title');
            const quality = title.split(' | ')[0];
            videoDownloads[quality] = $a.attr('href');
        });

        const videoUri = videoDownloads['720p'];
        if (!videoUri) {
            return;
        }

        const asset = new libingester.VideoAsset();

        asset.set_canonical_uri(uri);

        // Bizarrely enough, the only publish date information is in the LD-JSON (!!) text.
        const ldJson = JSON.parse($videoPage('script[type="application/ld+json"]').text());
        const date = new Date(Date.parse(ldJson.datePublished));
        asset.set_last_modified_date(date);

        const title = $videoPage('h1').text();
        asset.set_title(title);

        asset.set_download_uri(videoUri);

        hatch.save_asset(asset);
    })
    .catch(err => {
        console.error(err.stack);
        throw err;
    });
}

function main() {
    const hatch = new libingester.Hatch('voa', 'en');

    // Undocumented feature: if you pass an invalid page it returns all videos.
    const videosList = 'http://learningenglish.voanews.com/z/4729?p=999';
    libingester.util.fetch_html(videosList).then($videos => {
        const videoLinks = $videos('.program-body a.img-wrapper').map(function () {
            const link = $videos(this);
            const uri = link.attr('href');
            const fullUri = url.resolve(videosList, uri);
            return fullUri;
        }).get();

        return Promise.all(videoLinks.map(uri => ingestVideo(hatch, uri)));
    }).then(() => {
        return hatch.finish();
    });
}

main();
