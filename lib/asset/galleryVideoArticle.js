// eslint-disable-next-line no-nested-ternary
'use strict';

const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');

const BlogArticle = require('./blogArticle');

class GalleryVideoArticle extends BlogArticle {
    /**
     * Set multiple metadata at once.
     * @augments BlogArticle#set_metadata
     * @param {Object} metadata - The metadata can be:
     * @param {string} metadata.main_video - See {@link GalleryVideoArticle#set_main_video}.
     */
    set_metadata(metadata) {
        super.set_metadata(metadata);

        if (typeof metadata.main_video !== 'undefined') {
            this.set_main_video(metadata.main_video);
        }
    }

    set_main_video(value) {
        this._main_video = value;
    }

    render() {
        const templatePath = path.join(__dirname, '..', '..',
                                       'data/assets/gallery-video-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const galleryVideoStylesheet = path.join(__dirname, '..', '..',
                                                 'data/assets/gallery-video-stylesheet.scss');

        let stylesheet;
        if (!this._main_video) {
            throw new Error('GalleryVideoArticle requires a video! Use set_main_video.');
        }

        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',
                importer(uri) {
                    if (uri === '_default') {
                        return {
                            file: galleryVideoStylesheet,
                        };
                    }

                    // Default handler
                    return null;
                },
            });
        } else {
            stylesheet = sass.renderSync({
                file: galleryVideoStylesheet,
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
            main_video: this._main_video.asset_id,
            body: this._body.html(),
            canonical_uri: this._canonical_uri,
            read_more_text: this._read_more_text,
        });

        this._document = cheerio.load(document);
    }
}

module.exports = GalleryVideoArticle;
