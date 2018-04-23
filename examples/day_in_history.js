'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./day_in_history_template');
const url = require('url');

// Home page
const HOMEPAGE = 'http://www.thefreedictionary.com/_/archive.htm';

function ingestArticleProfile(hatch, uri) {
    return libingester.util.fetch_html(uri).then($profile => {
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // Use 'url' module to pull out query string date object
        const parts = url.parse(uri, true);
        const articleDate = parts.query.d;
        const modifiedDate = new Date(Date.parse(articleDate));
        asset.set_last_modified_date(modifiedDate);

        // Set date and title
        const title = `${$profile('h1').first().text()}: ${articleDate}`;

        // Pluck dayInHistoryYearBlob
        const dayInHistoryBlob = $profile('tr:contains("This Day in History")').next().text();

        // Pluck dayInHistoryYear
        const reHistory = /\(([0-9]){4}\)/g;
        const dayInHistoryYear = reHistory.exec(dayInHistoryBlob)[0];
        const dayInHistoryYearFinal = dayInHistoryYear.slice(1, 5);
        asset.set_license(dayInHistoryYearFinal);

        // Pluck dayInHistoryHead
        const dayInHistoryHead = dayInHistoryBlob.split(dayInHistoryYear)[0];
        const dayInHistoryHeadFinal = dayInHistoryHead.trim();
        asset.set_title(dayInHistoryHeadFinal);

        // Pluck dayInHistoryBody
        const dayInHistoryBody = dayInHistoryBlob.split(dayInHistoryYear)[1];
        const dayInHistoryBodyFinal = dayInHistoryBody.split('\tMore...')[0];
        asset.set_synopsis(dayInHistoryBodyFinal);

        const content = mustache.render(template.structure_template, {
            title,
            articleDate,

            dayInHistoryHead: dayInHistoryHeadFinal,
            dayInHistoryBody: dayInHistoryBodyFinal,
            dayInHistoryYear: dayInHistoryYearFinal,
        });

        // TODO: Convert to v2.0 API
        asset.set_document(content);
        asset.set_section('day_in_history');

        hatch.save_asset(asset);
    })
    .catch(err => {
        console.error(err.stack);
        throw err;
    });
}

function main() {
    const hatch = new libingester.Hatch('day_in_history', 'en');
    // make request to the index (home) page
    libingester.util.fetch_html(HOMEPAGE).then($pages => {
        // retrieve article URLs; '-2n+2' returns ~30 articles instead of 2,000+
        const articlesLinks = $pages('#Calendar div:nth-child(-2n+2) a').map(function () {
            const uri = $pages(this).attr('href');
            return url.resolve(HOMEPAGE, uri);
        }).get();

        Promise.all(articlesLinks.map(uri => ingestArticleProfile(hatch, uri)))
        .catch(err => console.log(err.stack)).then(() => {
            return hatch.finish();
        });
    });
}

main();
