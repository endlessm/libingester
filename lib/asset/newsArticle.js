'use strict';

const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');

const BaseAsset = require('./baseAsset');
const { ensureCheerio, fixLinks } = require('./util');

/** */
class NewsArticle extends BaseAsset {
    get ALLOWED_METADATA() {
        const allowed = [ 'authors', 'main_image', 'section', 'as_static_page', 'source',
                          'lede', 'body', 'custom_scss', 'read_more_link' ];
        return new Set([ ...super.ALLOWED_METADATA, ...allowed ]);
    }

    constructor(metadata = {}) {
        super(metadata);

        this._object_type = 'ArticleObject';
        this._content_type = 'text/html';
        if (typeof this._authors === 'undefined') {
            this._authors = [];
        }
    }

    /**
     * Set multiple metadata at once.
     * @augments BaseAsset#set_metadata
     * @param {Object} metadata - The metadata can be:
     * @param {(string|string[])} metadata.authors - See {@link NewsArticle#set_authors}.
     * @param {Object} metadata.main_image - See {@link NewsArticle#set_main_image}.
     * @param {string} metadata.section - See {@link NewsArticle#set_section}.
     * @param {boolean} metadata.as_static_page - See {@link NewsArticle#set_as_static_page}.
     * @param {string} metadata.source - See {@link NewsArticle#set_source}.
     * @param {(string|Cheerio)} metadata.lede - See {@link NewsArticle#set_lede}.
     * @param {(string|Cheerio)} metadata.body - See {@link NewsArticle#set_body}.
     * @param {string} metadata.custom_scss - See {@link NewsArticle#set_custom_scss}.
     * @param {(string|Cheerio)} metadata.read_more_link - See
     *  {@link NewsArticle#set_read_more_link}.
     */
    set_metadata(metadata) {
        super.set_metadata(metadata);

        Object.entries(metadata).forEach(([ key, value ]) => {
            switch (key) {
            case 'authors':
                this.set_authors(value);
                break;
            case 'main_image':
                this.set_main_image(value);
                break;
            case 'section':
                this.set_section(value);
                break;
            case 'as_static_page':
                if (value) {
                    this.set_as_static_page();
                }
                break;
            case 'source':
                this.set_source(value);
                break;
            case 'lede':
                this.set_lede(value);
                break;
            case 'body':
                this.set_body(value);
                break;
            case 'custom_scss':
                this.set_custom_scss(value);
                break;
            case 'read_more_link':
                this.set_read_more_link(value);
                break;
            }
        });
    }

    /**
     * Pass an array of names of article authors. If `value` is a string
     * instead of an array, it is assumed there is only one author. For the
     * blog article format, see {@link BlogArticle#set_author}.
     * @param {(string|string[])} value - The name or names of the author(s)
     */
    set_authors(value) {
        this._authors = value;
        if (!(value instanceof Array)) {
            this._authors = [value];
        }
    }

    /**
     * Marks an image as the "main" image of the article, which is marked up
     * specially. Includes an optional caption. Compare
     * {@link BlogArticle.set_main_image} and
     * {@link BlogArticle.set_main_image_caption}.
     *
     * (Make sure to remove this image from the HTML that you pass to
     * {@link NewsArticle#set_body}, otherwise it will be present twice in the
     * rendered post.)
     *
     * @param {ImageAsset} asset - The main image
     * @param {(string|Cheerio)} [caption] - HTML for the main image's caption
     */
    set_main_image(asset, caption) {
        this._main_image = asset;
        this._main_image_caption = ensureCheerio(caption);
    }

    set_tags() {
        throw new Error('Use set_section() for NewsArticle');
    }

    /**
     * Pass in the ID string of a "set" (category, tag). This is not the
     * human-readable string (though it's possible for the two to be
     * identical); you can create human-readable name for the set in your app
     * using other tools.
     *
     * (Compare {@link BlogArticle#set_tags} for the blog article format; news
     * articles are usually in one section of the news site at a time.)
     *
     * @param {string} value - The ID string of the set to give this article
     */
    set_section(value) {
        super.set_tags([value]);
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
     * Sets the lede (opening paragraph) of the news article. This paragraph is
     * marked up specially.
     *
     * (Make sure to remove this paragraph from the HTML that you pass to
     * {@link NewsArticle#set_body}, otherwise it will be present twice in the
     * rendered article.)
     *
     * @param {(string|Cheerio)} value - Opening paragraph of article
     */
    set_lede(value) {
        this._lede = fixLinks(value, this._canonical_uri);
    }

    /**
     * Pass the body of the article here. Note that this will be rendered
     * mostly unchanged, inside an `<article>` element. The ingester itself is
     * responsible for cleaning up this HTML such that the stylesheet applies
     * cleanly to it.
     *
     * Note that if you use {@link NewsArticle#set_lede}, you should make sure
     * the lede is not included in `value`, and likewise for
     * {@link NewsArticle#set_main_image}.
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
        this._body = fixLinks(value, this._canonical_uri);
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
     * Sets the HTML rendered at the bottom of the article, which can include
     * a link back to the original source. An example might be:
     *
     * ```html
     * Read more at <a href="http://...">Planet GNOME</a>
     * ```
     *
     * Use this for crediting original sources, for example.
     *
     * @param {(string|Cheerio)} value - HTML for the link
     */
    set_read_more_link(value) {
        this._read_more_link = cheerio.load(`<p>${value}</p>`);
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
                                       'data/assets/news-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const newsStylesheet = path.join(__dirname, '..', '..',
                                         'data/assets/news-stylesheet.scss');

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
            authors: this._authors.join(' &mdash; '),
            title: this._title,
            lede: this._lede.html(),
            main_image: mainImage,
            body: this._body.html(),
            read_more: this._read_more_link.html('p'),
        });
        this._document = cheerio.load(body);
    }

    _process() {
        return Promise.resolve().then(() => {
            this._replace_dom_asset_ids();
        });
    }

    to_hatch_metadata() {
        const metadata = super.to_hatch_metadata();
        Object.assign(metadata, {
            'document': this._document.html(),
            'authors': this._authors,
            'sourceName': this._source,
        });
        return metadata;
    }

    _get_dependent_asset_ids() {
        if (!this._document) {
            return [];
        }
        return this._document('[data-soma-job-id]').map(function () {
            return cheerio(this).attr('data-soma-job-id');
        }).get();
    }
}

module.exports = NewsArticle;
