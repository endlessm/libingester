'use strict';

const mustache = require('mustache');
const libingester = require('libingester');

// TODO: Add image captions handling

function ingestWowshackPage(hatch, uri) {
    return libingester.util.fetch_html(uri).then($profile => {
        const baseUri = libingester.util.get_doc_base_uri($profile, uri);

        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // Pull out the last-modified date.
        const modifiedStr = $profile('time[class="published"]').attr('datetime');
        const modifiedDate = new Date(Date.parse(modifiedStr));
        asset.set_last_modified_date(modifiedDate);
        asset.set_section('History');

        // Pull out the title from the profile box.
        const title = $profile('meta[itemprop="name"]').attr('content');
        asset.set_title(title);

        const imageGallery = $profile('img').map(function () {
            const imgAsset = libingester.util.download_img(this, baseUri);
            hatch.save_asset(imgAsset);
            return {
                imgAsset,
                caption: '',
            };
        }).get();

        // Construct a new document containing the content we want.
        const template = `
<section class="title">
  <h1>{{ title }}</h1>
</section>

<section class="gallery">
  <h2>Gallery</h2>
  {{#imageGallery}}
  <img data-libingester-asset-id="{{asset_id}}">
  {{/imageGallery}}
</section>`;

        const content = mustache.render(template, {
            title,
            imageGallery,
        });

        // TODO: Convert to v2.0 API
        asset.set_document(content);

        hatch.save_asset(asset);
    })
    .catch(err => {
        console.error(err.stack);
        throw err;
    });
}

function main() {
    const hatch = new libingester.Hatch('old_indonesia', 'en');

    const baseUri = 'https://www.wowshack.com/a-rare-historical-look-at-old-indonesia-25-photos-taken-pre-1920/';
    ingestWowshackPage(hatch, baseUri).then(() => {
        return hatch.finish();
    });
}

main();
