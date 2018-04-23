'use strict';

const mustache = require('mustache');
const rp = require('request-promise');
const url = require('url');
const libingester = require('libingester');

function ingestProfile(hatch, uri) {
    return libingester.util.fetch_html(uri).then($profile => {
        const baseUri = libingester.util.get_doc_base_uri($profile, uri);

        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // Pull out the last-modified date.
        const modifiedStr = $profile('meta[property="article:modified_time"]').attr('content');
        const modifiedDate = new Date(Date.parse(modifiedStr));
        asset.set_last_modified_date(modifiedDate);

        // Pull out the description.
        const description = $profile('meta[name="description"]').attr('content');
        asset.set_synopsis(description);

        // Put this in the "Profiles" sections of the app. Must match the name of the section
        // in the rest of the app.
        asset.set_section('Profiles');

        // Pull out the title from the profile box.
        const title = $profile('.profile-box [itemprop="name"]').text();
        asset.set_title(title);

        // Pull out the biography.
        const bio = $profile('[itemtype="http://schema.org/NewsArticle"]').first();
        bio.find('.btn-more').remove();

        // XXX: Cheerio doesn't support .unwrap()
        // see https://github.com/cheeriojs/cheerio/pull/851/files
        const bioExtraContent = bio.find('.extraContent');
        bioExtraContent.replaceWith($profile.html(bioExtraContent.get(0).children));

        const headshotImg = $profile('.profile-box picture img').first();
        const headshotImage = libingester.util.download_img(headshotImg, baseUri);
        hatch.save_asset(headshotImage);

        // Use the profile image as article thumbnail
        asset.set_thumbnail(headshotImage);

        const imageGallery = $profile('.Collage img').map(function () {
            const imgAsset = libingester.util.download_img(this, baseUri);
            hatch.save_asset(imgAsset);
            return imgAsset;
        }).get();

        // Construct a new document containing the content we want.
        const template = `
<section class="title">
  <h1>{{ title }}</h1>
  <img data-libingester-asset-id="{{headshotImage.asset_id}}">
</section>

{{{ bioHtml }}}

<section class="gallery">
  <h2>Gallery</h2>
  {{#imageGallery}}
  <img data-libingester-asset-id="{{asset_id}}">
  {{/imageGallery}}
</section>`;

        const content = mustache.render(template, {
            title,
            headshotImage,
            imageGallery,
            bioHtml: bio.html(),
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
    const hatch = new libingester.Hatch('olympic', 'en');

    const baseUri = 'https://www.olympic.org/';
    const profilesList = 'https://www.olympic.org/ajaxscript/loadmoretablelist/games/athletes/%7BA5FEFBC6-8FF7-4B0A-A96A-EB7943EA4E2F%7D/100/0';
    rp({ uri: profilesList, json: true }).then(response => {
        const profileUris = response.content.map(datum => url.resolve(baseUri, datum.urlName));
        return Promise.all(profileUris.map(uri => ingestProfile(hatch, uri)));
    }).then(() => {
        return hatch.finish();
    });
}

main();
