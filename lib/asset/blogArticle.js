// eslint-disable-next-line no-nested-ternary
'use strict';

const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');

const BaseAsset = require('./baseAsset');
const { ensureCheerio, fixLinkTargets } = require('./util');

/** */
class BlogArticle extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'ArticleObject';
        this._content_type = 'text/html';
        this._tags = [];
    }

    /**
     * Pass in the name of the post author here. (The Blog article format
     * currently only is designed to handle one author.) For the News article
     * format, see {@link NewsArticle#set_authors}.
     * @param {string} value - The author of the blog post
     */
    set_author(value) {
        this._author = value;
    }

    /**
     * Marks an image as the "main" image of the post, which is marked up
     * specially. (Make sure to remove this image from the HTML that you pass
     * to {@link NewsArticle#set_body}, otherwise it will be present twice in
     * the rendered post.)
     * @param {ImageAsset} value - Main image of the article
     */
    set_main_image(value) {
        this._main_image = value;
    }

    /**
     * Sets a caption to go with the image set by
     * {@link BlogArticle#set_main_image}.
     * @param {string} value - Caption text
     */
    set_main_image_caption(value) {
        this._main_image_caption = value;
    }

    /**
     * Pass the body of the article as HTML here. Note that this will be
     * rendered mostly unchanged, inside an `<article>` element. The ingester
     * itself is responsible for cleaning up this HTML such that the stylesheet
     * applies cleanly to it.
     *
     * If you use {@link BlogArticle#set_main_image}, make sure to remove the
     * main image from this HTML.
     *
     * The ingester is responsible for passing cleaned-up HTML that the
     * stylesheet's rules will apply to. In many cases this will not be
     * necessary, but in other cases quite a lot of cleanup might be needed.
     * Some hints to take into account:
     *
     * - Figures should be inside `<figure>` elements, not paragraphs
     * - Figures with captions should also contain `<figcaption>` elements
     * - Quotes should be inside `<blockquote>` elements, properly formatted
     *   inside with `<p>` (and `<cite>` if applicable)
     * - Paragraphs should be in `<p>` elements, not denoted with `<br>`
     *   linebreaks
     *
     * @param {(string|Cheerio)} value - Body HTML of article
     */
    set_body(value) {
        this._body = fixLinkTargets(ensureCheerio(value));
    }

    /**
     * Here is where to customize the stylesheet. Most customizations should be
     * able to be accomplished just by tweaking some SCSS variables which the
     * stylesheet exposes. Here is a list of the variables:
     *
     * - `$primary-light-color`
     * - `$primary-dark-color`
     * - `$accent-light-color`
     * - `$accent-dark-color`
     * - `$background-light-color`
     * - `$background-dark-color`
     * - `$title-font`
     * - `$body-font`
     * - `$context-font`
     * - `$support-font`
     *
     * The default stylesheet is included with `@import '_default';`. (Note
     * that you can also leave out this import and start from a blank
     * stylesheet to completely do your own thing.) If you are adding rules as
     * well as customizing variables, make sure that the variables are
     * specified before the import, and the rules are specified after it.
     *
     * @param {string} value - A string containing SCSS code
     */
    set_custom_scss(value) {
        this._custom_scss = value;
    }

    /**
     * Sets the text rendered at the bottom of the post. Unlike
     * {@link NewsArticle#set_read_more_link}, this takes text rather than
     * HTML, because the blog article format is a bit more strict about what it
     * renders there. An example might be "Original article at Planet GNOME"
     * which is turned into a link during rendering.
     * @param {string} value - Text for the post bottom
     */
    set_read_more_text(value) {
        this._read_more_text = value;
    }

    /**
     * Pass in an array of ID strings for "sets" (categories, tags). The ID
     * string is not the human-readable string (though it's possible for the
     * two to be identical); you can create human-readable name for the set in
     * your app using other tools. (Compare {@link NewsArticle#set_section}.)
     * @param {string[]} value - Array of ID strings
     */
    set_tags(value) {
        this._tags = value;
    }

    /**
     * Marks the page as a "static" page so that it will show up on the main
     * menu of an app. Use this for e.g. "About the author" or "FAQ" pages.
     */
    set_as_static_page() {
        this._ekn_tags.push(BaseAsset.EKN_STATIC_TAG);
    }

    to_metadata() {
        const metadata = super.to_metadata();
        Object.assign(metadata, {
            'document': this._document.html(),
            'authors': [this._author],
        });

        return metadata;
    }

    _process() {
        return Promise.resolve().then(() => {
            this._replace_dom_asset_ids();
        });
    }

    /**
     * Takes the metadata that has been set on this asset so far, and renders
     * an HTML page internally in preparation for saving into a hatch.
     *
     * You must call `render()` before passing this asset to
     * {@link Hatch#save_asset}.
     * No other methods should be called on the asset after calling `render()`.
     */
    render() {
        const templatePath = path.join(__dirname, '..', '..', 'data/assets/blog-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const blogStylesheet = path.join(__dirname, '..', '..', 'data/assets/blog-stylesheet.scss');

        let stylesheet;
        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',
                importer(uri) {
                    if (uri === '_default') {
                        return {
                            file: blogStylesheet,
                        };
                    }

                    // Default handler
                    return null;
                },
            });
        } else {
            stylesheet = sass.renderSync({
                file: blogStylesheet,
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
            main_image_caption: this._main_image_caption,
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

module.exports = BlogArticle;
