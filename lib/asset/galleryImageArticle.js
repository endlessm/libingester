// eslint-disable-next-line no-nested-ternary
'use strict';

const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');

const BaseAsset = require('./baseAsset');
const { ensureCheerio, fixLinkTargets } = require('./util');

class GalleryImageArticle extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'ArticleObject';
        this._content_type = 'text/html';
        this._temporal_coverage = [];
    }

    set_author(value) {
        this._author = value;
    }

    set_main_image(value) {
        this._main_image = value;
    }

    set_body(value) {
        this._body = fixLinkTargets(ensureCheerio(value));
    }

    set_custom_scss(value) {
        this._custom_scss = value;
    }

    set_read_more_text(value) {
        this._read_more_text = value;
    }

    set_tags(value) {
        this._tags = value;
    }

    set_as_static_page() {
        this._ekn_tags.push(BaseAsset.EKN_STATIC_TAG);
    }

    // temporal_coverage here is an array of dates, sorted
    // in ascending order. The consumer is responsible for
    // translating this into something sensible in accordance
    // with the user's localisation preferences per
    // http://schema.org/temporalCoverage
    set_temporal_coverage(value) {
        let arrayValue = [value];
        if (value instanceof Array) {
            arrayValue = value;
        }

        this._temporal_coverage = arrayValue.map(v => {
            if (v instanceof Date) {
                return v;
            }

            return new Date(v);
        }).sort();
    }

    to_metadata() {
        const metadata = super.to_metadata();
        Object.assign(metadata, {
            'document': this._document.html(),
            'authors': [this._author],
            'temporalCoverage': this._temporal_coverage,
        });
        return metadata;
    }

    _process() {
        return Promise.resolve().then(() => {
            this._replace_dom_asset_ids();
        });
    }

    render() {
        const templatePath = path.join(__dirname, '..', '..',
                                       'data/assets/gallery-image-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const galleryImageStylesheet = path.join(__dirname, '..', '..',
                                                 'data/assets/gallery-image-stylesheet.scss');

        let stylesheet;
        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',
                importer(uri) {
                    if (uri === '_default') {
                        return {
                            file: galleryImageStylesheet,
                        };
                    }

                    // Default handler
                    return null;
                },
            });
        } else {
            stylesheet = sass.renderSync({
                file: galleryImageStylesheet,
                outputStyle: 'compressed',
            });
        }

        let mainImage;
        if (this._main_image) {
            mainImage = this._main_image.asset_id;
        }

        const document = mustache.render(template, {
            stylesheet: stylesheet.css,
            author: this._author,
            title: this._title,
            main_image: mainImage,
            body: this._body.html(),
            canonical_uri: this._canonical_uri,
            read_more_text: this._read_more_text,
        });

        this._document = cheerio.load(document);
    }

    _get_dependent_asset_ids() {
        return this._document('[data-soma-job-id]').map(function () {
            return cheerio(this).attr('data-soma-job-id');
        }).get();
    }
}

module.exports = GalleryImageArticle;
