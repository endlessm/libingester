'use strict';

const libingester = require('libingester');

const rssUri = 'http://www.livingloving.net/feed/';

const imgMetadata = [
    'class',
    'data-jpibfi-indexer',
    'data-jpibfi-post-excerpt',
    'data-jpibfi-post-url',
    'data-jpibfi-post-title',
    'height',
    'id',
    'rscset',
    'sizes',
    'src',
    'width',
];

const removeElements = [
    'iframe',
    'input',
    'noscript',
    'script',
    '.link_pages',
    '.jp-relatedposts',
    '.post-tags',
    '.sharedaddy',
    '[id*="more-"]',
];

function ingestArticle(hatch, uri) {
    return libingester.util.fetch_html(uri).then($profile => {
        const baseUri = libingester.util.get_doc_base_uri($profile, uri);

        const modifiedDate = $profile('meta[property="article:modified_time"]').attr('content');
        const articleEntry = $profile('.post .post-heading .meta').first();
        const articleData = $profile(articleEntry).text().split(' • ');
        const author = articleData[0];
        const datePublished = articleData[1];
        const title = $profile('meta[property="og:title"]').attr('content');
        const synopsis = $profile('meta[property="og:description"]').attr('content');
        const body = $profile('.post-entry').first();

        const tags = $profile('a[rel="category tag"]').map(function () {
            return $profile(this).text();
        }).get();

        const meta = $profile('.post .post-heading .meta').first();
        meta.find('.bullet').remove();

        const mainImg = $profile('.post-img a img');
        const mainImage = libingester.util.download_img(mainImg, baseUri);
        mainImage.set_title(title);
        hatch.save_asset(mainImage);

        // eslint-disable-next-line array-callback-return
        body.find('img').map(function () {
            if (typeof this.attribs.src !== 'undefined') {
                const image = libingester.util.download_img(this, baseUri);
                image.set_title(title);
                hatch.save_asset(image);
                this.attribs['data-libingester-asset-id'] = image.asset_id;
                for (const imgMeta of imgMetadata) {
                    delete this.attribs[imgMeta];
                }
            }
        });

        for (const removeElement of removeElements) {
            body.find(removeElement).remove();
        }

        const asset = new libingester.BlogArticle();
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date(Date.parse(modifiedDate)));
        asset.set_title(title);
        asset.set_synopsis(synopsis);
        asset.set_thumbnail(mainImage);
        asset.set_author(author);
        asset.set_date_published(datePublished);
        asset.set_license('Proprietary');
        asset.set_main_image(mainImage);
        asset.set_main_image_caption('Image Caption');
        asset.set_body(body);
        asset.set_tags(tags);
        asset.set_read_more_text('Original Article at wwww.livingloving.net');
        asset.set_custom_scss(`
            $body-font: Lato;
            $title-font: Raleway;
            $primary-light-color: #729fcf;
            $primary-dark-color: #204a87;
            $accent-light-color: #8ae234;
            $accent-dark-color: #4e9a06;
            $background-light-color: #eeeefc;
            $background-dark-color: #888a95;
            @import '_default';
        `);
        asset.render();

        hatch.save_asset(asset);
    })
    .catch(err => {
        console.error(err.stack);
        throw err;
    });
}

function main() {
    const hatch = new libingester.Hatch('livingloving', 'id');
    libingester.util.fetch_rss_entries(rssUri).then(items => {
        const articlesLinks = items.map(datum => datum.link);
        Promise.all(articlesLinks.map(uri => {
            return ingestArticle(hatch, uri);
        })).then(() => hatch.finish());
    });
}

main();
