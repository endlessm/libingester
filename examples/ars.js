'use strict';

// Ars Technica, Open Source tag example

const Libingester = require('libingester');

const FEED_URI = 'http://feeds.arstechnica.com/arstechnica/open-source';
const COMMENT_NODE = 8;

function removeIntermediate($, selector) {
    $(selector).each((i, elem) => $(elem).replaceWith($(elem).contents()));
}

function ingestArticle(hatch, entry) {
    return Libingester.util.fetch_html(entry.link).then($ => {
        const BASE_URI = Libingester.util.get_doc_base_uri($, entry.link);
        const asset = new Libingester.NewsArticle();

        console.log('processing', entry.title);
        asset.set_title(entry.title);
        asset.set_synopsis(entry.description);
        asset.set_date_published(entry.pubdate);
        asset.set_last_modified_date(entry.date);
        asset.set_source('Ars Technica');
        asset.set_license('Proprietary');
        asset.set_section('open-source');
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

        const canonicalUri = $('head link[rel="canonical"]').attr('href');
        asset.set_canonical_uri(canonicalUri);
        asset.set_read_more_link(`Read more at <a href="${canonicalUri}">Ars Technica</a>`);

        const thumbUri = $('meta[property="og:image"]').attr('content');
        const thumbAsset = Libingester.util.download_image(thumbUri);
        hatch.save_asset(thumbAsset);
        asset.set_thumbnail(thumbAsset);

        // Clean up
        $('div').filter(function () {
            return $(this).text().trim() === '';
        }).remove();
        $('head, script, .site-header, .ad, #social-left').remove();
        [ '.site-wrapper', '.content-wrapper', '.column-wrapper', '.left-column',
          '.article-content' ].forEach(sel => removeIntermediate($, sel));

        // oops, should deal with multiple pages
        $('.page-numbers').remove();
        $(`.story-sidebar, .enlarge-link, .post-upperdek, .article-author,
            #social-footer, #article-footer-wrap, .site-footer, .tools-info,
            #promoted-comments`).remove();
        $('*').contents().each(function () {
            if (this.nodeType === COMMENT_NODE) {
                $(this).remove();
            }
        });

        const authors = $('header [itemprop~="author"] [itemprop~="name"]')
            .map((i, elem) => $(elem).text())
            .get();
        asset.set_authors(authors);
        $('header').remove();

        let mainCandidates = $('figure.intro-image');
        if (!mainCandidates.length) {
            mainCandidates = $('figure');
        }
        if (mainCandidates.length) {
            const mainCandidate = mainCandidates.first();
            const img = $('img', main);
            const imgAsset = Libingester.util.download_img(img, BASE_URI);
            hatch.save_asset(imgAsset);
            asset.set_main_image(imgAsset, $('figcaption', mainCandidate));
            $(mainCandidate).remove();
        }

        const firstPara = $('section p').first();
        asset.set_lede(firstPara);
        $(firstPara).remove();

        // Clean up classes for readability
        $('body, article, section, figure, figcaption').removeAttr('class');
        $('article').removeAttr('itemscope itemtype');
        $('figure').removeAttr('style');

        // Save assets for any remaining figures
        $('figure').each(function () {
            const figAsset = Libingester.util.download_img($('img', this),
                                                           BASE_URI);
            hatch.save_asset(figAsset);
        });

        asset.set_body($('section'));

        asset.render();
        hatch.save_asset(asset);
    })
    .catch(err => {
        console.error(err.stack);
        throw err;
    });
}

function main() {
    const hatch = new Libingester.Hatch('ars', 'en');
    Libingester.util.fetch_rss_entries(FEED_URI).then(items => {
        Promise.all(items.map(entry => ingestArticle(hatch, entry)));
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log('there was an error', err);
        process.exitCode = 1;
    });
}

main();
