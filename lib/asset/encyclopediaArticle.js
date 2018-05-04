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
class EncyclopediaArticle extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'ArticleObject';
        this._content_type = 'text/html';
        this._authors = [];
    }

    /**
     * Marks an image as the "main" image of the article commonly appearing in the,
     * card on the right of the article. Compare
     * {@link BlogArticle.set_main_image} and
     * {@link BlogArticle.set_main_image_caption}.
     *
     * (Make sure to remove this image from the HTML that you pass to
     * {@link EncyclopediaArticle#set_body}, otherwise it will be present twice in the
     * rendered post.)
     *
     * @param {ImageAsset} asset - The main image
     * @param {(string|Cheerio)} [caption] - HTML for the main image's caption
     */
    set_main_image(asset, caption) {
        this._main_image = asset;
        this._main_image_caption = ensureCheerio(caption);
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

    /**
     * Name of the publication, e.g. "New York Times". This shows up in a link
     * in the rendered news article.
     * @param {string} value - The name of the source
     */
    set_source(value) {
        this._source = value;
    }

    /**
     * Pass the body of the article here. Note that this will be rendered
     * mostly unchanged, inside an `<article>` element. The ingester itself is
     * responsible for cleaning up this HTML such that the stylesheet applies
     * cleanly to it.
     *
     * Note that if you use {@link NewsArticle#set_main_image}, you should make sure
     * it is not included in `value`
     *
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
     * Takes the metadata that has been set on this asset so far, and renders
     * an HTML page internally in preparation for saving into a hatch.
     *
     * You must call `render()` before passing this asset to
     * {@link Hatch#save_asset}.
     * No other methods should be called on the asset after calling `render()`.
     */
    render() {
        let mainImage = false;
        if (this._main_image) {
            mainImage = {
                asset_id: this._main_image.asset_id,
            };
            if (this._main_image_caption.length) {
                mainImage.caption = cheerio.html(this._main_image_caption);
            }
        }

        cheerio('a', this._read_more_link).addClass('eos-show-link');

        const templatePath = path.join(__dirname, '..', '..',
                                       'data/assets/encyclopedia-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const newsStylesheet = path.join(__dirname, '..', '..',
                                         'data/assets/encyclopedia-stylesheet.scss');

        let stylesheet;
        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',
                importer(uri) {
                    if (uri === '_default') {
                        return {
                            file: newsStylesheet,
                        };
                    }

                    // Default handler
                    return null;
                },
            });
        } else {
            stylesheet = sass.renderSync({
                file: newsStylesheet,
                outputStyle: 'compressed',
            });
        }

        const body = mustache.render(template, {
            stylesheet: stylesheet.css,
            canonical_uri: this._canonical_uri,
            source: this._source,
            title: this._title,
            main_image: mainImage,
            body: this._body.html(),
        });
        this._document = cheerio.load(body);
    }

    _process() {
        return Promise.resolve().then(() => {
            this._replace_dom_asset_ids();
        });
    }

    to_metadata() {
        const metadata = super.to_metadata();
        Object.assign(metadata, {
            'document': this._document.html(),
            'sourceName': this._source,
        });
        return metadata;
    }

    _get_dependent_asset_ids() {
        return this._document('[data-soma-job-id]').map(function () {
            return cheerio(this).attr('data-soma-job-id');
        }).get();
    }
}

module.exports = EncyclopediaArticle;
