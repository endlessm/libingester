// eslint-disable-next-line no-nested-ternary
'use strict';

const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');

const BlogArticle = require('./blogArticle');

class GalleryImageArticle extends BlogArticle {
    get ALLOWED_METADATA() {
        return new Set([ ...super.ALLOWED_METADATA, 'temporal_coverage' ]);
    }

    constructor(metadata = {}) {
        super(metadata);

        if (typeof this._temporal_coverage === 'undefined') {
            this._temporal_coverage = [];
        }
    }

    /**
     * Set multiple metadata at once.
     * @augments BlogArticle#set_metadata
     * @param {Object} metadata - The metadata can be:
     * @param {string} metadata.temporal_coverage - See
     *  {@link GalleryImageArticle#set_temporal_coverage}.
     */
    set_metadata(metadata) {
        super.set_metadata(metadata);

        Object.entries(metadata).forEach(([ key, value ]) => {
            if (key === 'temporal_coverage') {
                this.set_temporal_coverage(value);
            }
        });
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

    to_hatch_metadata() {
        const metadata = super.to_hatch_metadata();
        Object.assign(metadata, {
            'temporalCoverage': this._temporal_coverage,
        });
        return metadata;
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
}

module.exports = GalleryImageArticle;
