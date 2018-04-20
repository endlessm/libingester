'use strict';

const crypto = require('crypto');
const path = require('path');

const aws = require('aws-sdk');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');
const tar = require('tar');

const config = require('./config');
const { logger } = require('./logging');
const verify = require('./verify');

// For some reason we still seem to need this method promisified
const { promisify } = require('util');
fs.writeFile = promisify(fs.writeFile);

const EKN_STATIC_TAG = 'EknStaticTag';

// Increment this value by one anytime the hatch format changes in a backwards
// incompatible way
const HATCH_VERSION = 2;

// Max acceptable fail rate for a hatch
const HATCH_FAIL_RATE_THRESHOLD = 0.9;

function newAssetId() {
    const hash = crypto.createHash('sha1');
    hash.update(crypto.randomBytes(32));
    return hash.digest('hex');
}

// Date formatting is awful in JS but using a lib was too heavy
function getTimestamp() {
    const date = new Date();

    const padNumber = value => String(value).padStart(2, '0');

    const year = date.getFullYear();
    const month = padNumber(date.getMonth() + 1);
    const day = padNumber(date.getDate());
    const hour = padNumber(date.getHours());
    const minute = padNumber(date.getMinutes());
    const second = padNumber(date.getSeconds());

    return `${year}${month}${day}_${hour}${minute}${second}`;
}

function _fixLinkTargets(content) {
    // External links with target="_blank" won't open in default
    // browser
    cheerio('a[target="_blank"]', content).removeAttr('target');
    return content;
}

function _ensureCheerio(value) {
    if (typeof value === 'string') {
        return cheerio.load(value);
    }
    return value;
}

function _ensureDate(value) {
    if (value instanceof Date) {
        if (isNaN(value.getTime())) {
            logger.warn('Provided an invalid date object');
            return null;
        }
        return value;
    }

    try {
        return new Date(value);
    } catch (err) {
        logger.warn(`Could not coerce value into a date: ${value}`);
        return null;
    }
}

function _ensureSynopsis(value) {
    if (value === undefined) {
        logger.warn('Trying to set an empty synopsis! ' +
                    'This is most likely an error in the ingester!');
        return null;
    }

    return value.trim().replace(/[\s]{1,}/g, ' ');
}

class ValidationError extends Error {
}

/** */
class BaseAsset {
    constructor() {
        this._asset_id = newAssetId();
        this._ekn_tags = [];
        this._tags = [];
    }

    /**
     * 20-byte hex ID of the document
     * @type string
     * @readonly
     */
    get asset_id() {
        return this._asset_id;
    }

    /**
     * @param {string} value - Title of the document
     */
    set_title(value) {
        this._title = value.trim();
    }

    /**
     * Sets the text that will be shown as the synopsis of a document. (The
     * synopsis is often shown in the UI on "cards" if there is enough space.)
     * @param {string} value - Text describing the document
     */
    set_synopsis(value) {
        this._synopsis = _ensureSynopsis(value);
    }

    /**
     * Sets an image asset to be the article's thumbnail. (An image asset is
     * returned e.g. from {@link utildownload_img|util.download_img} or
     * {@link utildownload_image|util.download_image}.)
     * @param {ImageAsset} value - Image
     */
    set_thumbnail(value) {
        this._thumbnail_asset_id = value.asset_id;
    }

    /**
     * @param {string} value
     */
    set_canonical_uri(value) {
        this._canonical_uri = value;
    }

    /**
     * @param {(Date|number|string)} value
     */
    set_last_modified_date(value) {
        this._last_modified_date = _ensureDate(value);
    }

    /**
     * Pass the date that the post or article was published. You can pass a
     * Date object here. If it is not a Date object, then `new Date()` will be
     * called on it, so you can also pass e.g. a timestamp.
     * @param {(Date|number|string)} value - The publishing date of this
     *   document
     */
    set_date_published(value) {
        this._date_published = _ensureDate(value);
    }

    /**
     * @param {number} value
     */
    set_sequence_number(value) {
        this._sequence_number = value;
    }

    /**
     * @param {string} value
     */
    set_license(value) {
        this._license = value;
    }

    /**
     * Pass in an array of ID strings for "sets" (categories, tags). The ID
     * string is not the human-readable string (though it's possible for the
     * two to be identical); you can create a human-readable name for the set
     * in your app using other tools.
     *
     * Compare {@link NewsArticle#set_section}.
     *
     * @param {string[]} value - List of ID strings
     */
    set_tags(value) {
        this._tags = value;
    }

    _normalize_tags() {
        return this._make_tags().concat(this._ekn_tags)
            .filter(tag => typeof tag === 'string')
            .map(tag => tag.trim());
    }

    /**
     * @returns {(Buffer|null)}
     */
    to_data() {
        return null;
    }

    /**
     * @returns {Object}
     */
    to_metadata() {
        // Build an object with all required fields
        const metadata = {
            'assetID': this._asset_id,
            'objectType': this._object_type,
            'contentType': this._content_type,

            'canonicalURI': this._canonical_uri,
            'matchingLinks': [this._canonical_uri],

            'title': this._title,
            'tags': this._normalize_tags(),
            'revisionTag': getTimestamp(),
        };

        // Add optional fields if they're present
        if (this._date_published) {
            metadata.published = this._date_published.toISOString();
        }
        if (this._last_modified_date) {
            metadata.lastModifiedDate = this._last_modified_date.toISOString();
            metadata.revisionTag = this._last_modified_date.toISOString();
        }
        if (this._sequence_number !== undefined) {
            metadata.sequenceNumber = this._sequence_number;
        }
        if (this._license) {
            metadata.license = this._license;
        }
        if (this._synopsis) {
            metadata.synopsis = this._synopsis;
        }
        if (this._thumbnail_asset_id) {
            metadata.thumbnail = this._thumbnail_asset_id;
        }

        return metadata;
    }

    _process() {
        return Promise.resolve();
    }

    _make_tags() {
        return this._tags;
    }

    _replace_dom_asset_ids() {
        const $elem = this._document;

        if (!$elem) {
            throw new Error('Must call asset.render() before saving ' +
                            `${this.constructor.name} to a hatch.`);
        }

        $elem('[data-libingester-asset-id]').each(function () {
            const $asset = cheerio(this);

            const assetId = $asset.attr('data-libingester-asset-id');
            if (assetId) {
                $asset.attr('data-soma-job-id', assetId);
                $asset.attr('data-libingester-asset-id', null);
            }

            if (!$asset.attr('data-soma-job-id')) {
                throw new ValidationError('Document has media without associated asset. ' +
                                          'Please ingest it or drop it.');
            }
        });
    }

    _save_to_hatch(hatch) {
        const hatchPath = hatch._path;
        hatch._assets.push(this);
        hatch._promises.push(this._process().then(() => {
            const data = this.to_data();
            const metadata = this.to_metadata();

            if (data) {
                metadata.cdnFilename = `${metadata.assetID}.data`;
            }

            verify.verify_metadata(metadata);

            const metadataText = JSON.stringify(metadata, null, 2);
            const promises = [];

            promises.push(fs.writeFile(path.join(hatchPath, `${this._asset_id}.metadata`),
                                       metadataText,
                                       { encoding: 'utf-8' }));

            if (data) {
                promises.push(fs.writeFile(path.join(hatchPath, `${this._asset_id}.data`), data,
                                           { encoding: 'utf-8' }));
            }

            return Promise.all(promises);
        }).catch(err => {
            logger.error(err);
            if (err instanceof verify.VerificationError && err.metadata) {
                logger.debug(err.metadata);
            }
            hatch._failed_assets.push(this);
        }));
    }

    _get_thumbnail_asset_id() {
        return this._thumbnail_asset_id;
    }

    _get_dependent_asset_ids() {
        return [];
    }

    /**
     * @returns {Set<BaseAsset>}
     */
    get_dependent_assets() {
        const assets = new Set();
        const thumbnailId = this._get_thumbnail_asset_id();
        if (thumbnailId) {
            assets.add(thumbnailId);
        }
        for (const dependentAssetId of this._get_dependent_asset_ids()) {
            assets.add(dependentAssetId);
        }
        return assets;
    }
}

/** */
class ImageAsset extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'ImageObject';
    }

    /**
     * @param {string} content_type
     * @param {(Buffer|Promise<Buffer>)} image_data
     */
    set_image_data(contentType, imageData) {
        this._content_type = contentType;
        this._image_data = imageData;
    }

    _process() {
        // In case _image_data is a promise, resolve it before verifying it
        return Promise.resolve(this._image_data).then(() => {
            verify.verify_image_data(this._image_data);
        });
    }

    to_data() {
        return this._image_data;
    }
}

/** */
class VideoAsset extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'VideoObject';
    }

    /**
     * @param {string} value
     */
    set_download_uri(value) {
        this._download_uri = value;
    }

    _save_to_hatch(hatch) {
        hatch._videos.push({
            asset_id: this.asset_id,
            uri: this._download_uri,
            title: this._title,
        });

        hatch._promises.push(this._process().then(() => {
            const metadata = this.to_metadata();
            verify.verify_metadata(metadata);
            const metadataText = JSON.stringify(metadata, null, 2);
            return fs.writeFile(path.join(hatch._path, `${this._asset_id}.metadata`),
                                metadataText,
                                { encoding: 'utf-8' });
        })
        .catch(err => {
            logger.error(err);
            if (err instanceof verify.VerificationError && err.metadata) {
                logger.debug(err.metadata);
            }
            hatch._failed_assets.push(this);
        }));
    }

    to_metadata() {
        const metadata = super.to_metadata();
        metadata.canonicalURI = metadata.canonicalURI || this._download_uri;
        if (!metadata.matchingLinks.length || !metadata.matchingLinks[0]) {
            metadata.matchingLinks = [this._download_uri];
        }
        return metadata;
    }
}

class DictionaryAsset extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'DictionaryWordObject';
        this._content_type = 'text/html';
    }

    set_word(value) {
        this._word = value;
    }

    set_definition(value) {
        this._definition = value;
    }

    set_part_of_speech(value) {
        this._part_of_speech = value;
    }

    set_tags(value) {
        this._tags = value;
    }

    set_source(value) {
        this._source = value;
    }

    set_body(value) {
        this._body = _fixLinkTargets(_ensureCheerio(value));
    }

    set_custom_scss(value) {
        this._custom_scss = value;
    }

    set_main_image(value) {
        this._main_image = value;
    }

    to_metadata() {
        const metadata = super.to_metadata();
        Object.assign(metadata, {
            'word': this._word,
            'definition': this._definition,
            'partOfSpeech': this._part_of_speech,
            'tags': [this._tags],
            'document': this._document.html(),
        });
        return metadata;
    }

    render() {
        let mainImage = false;
        if (this._main_image) {
            mainImage = {
                asset_id: this._main_image.asset_id,
            };
        }

        const templatePath = path.join(__dirname, './assets/dictionary-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const dictionaryStylesheet = path.join(__dirname, './assets/news-stylesheet.scss');

        const sassOptions = {
            outputStyle: 'compressed',
        };

        if (!this._custom_scss) {
            sassOptions.file = dictionaryStylesheet;
        } else {
            sassOptions.data = this._custom_scss;

            // XXX: Do we need `done` here?
            sassOptions.importer = (uri, prev, done) => {
                if (uri === '_default') {
                    return {
                        file: dictionaryStylesheet,
                    };
                }

                // Default handler
                return null;
            };
        }

        const stylesheet = sass.renderSync(sassOptions);

        const body = mustache.render(template, {
            stylesheet: stylesheet.css,
            canonical_uri: this._canonical_uri,
            source: this._source,
            title: this._title,
            word: this._word,
            definition: this._definition,
            part_of_speech: this._part_of_speech,
            main_image: mainImage,
            body: this._body.html(),
        });
        this._document = cheerio.load(body);
    }
}

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
        this._body = _fixLinkTargets(_ensureCheerio(value));
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
        this._ekn_tags.push(EKN_STATIC_TAG);
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
        const templatePath = path.join(__dirname, './assets/blog-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const blogStylesheet = path.join(__dirname, './assets/blog-stylesheet.scss');

        let stylesheet;
        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',

                // XXX: Do we need `done` here?
                importer(uri, prev, done) {
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
        this._body = _fixLinkTargets(_ensureCheerio(value));
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
        this._ekn_tags.push(EKN_STATIC_TAG);
    }

    // temporal_coverage here is an array of dates, sorted
    // in ascending order. The consumer is responsible for
    // translating this into something sensible in accordance
    // with the user's localisation preferences per
    // http://schema.org/temporalCoverage
    set_temporal_coverage(value) {
        const arrayValue = value instanceof Array ? value : [value];
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
        const templatePath = path.join(__dirname, './assets/gallery-image-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const galleryImageStylesheet = path.join(__dirname,
                                                 './assets/gallery-image-stylesheet.scss');

        let stylesheet;
        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',

                // XXX: Do we need `done` here?
                importer(uri, prev, done) {
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

class GalleryVideoArticle extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'ArticleObject';
        this._content_type = 'text/html';
    }

    set_author(value) {
        this._author = value;
    }

    set_main_image(value) {
        this._main_image = value;
    }

    set_main_video(value) {
        this._main_video = value;
    }

    set_body(value) {
        this._body = _fixLinkTargets(_ensureCheerio(value));
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
        this._ekn_tags.push(EKN_STATIC_TAG);
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

    render() {
        const templatePath = path.join(__dirname, './assets/gallery-video-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const galleryVideoStylesheet = path.join(__dirname,
                                                 './assets/gallery-video-stylesheet.scss');

        let stylesheet;
        if (!this._main_video) {
            throw new Error('GalleryVideoArticle requires a video! Use set_main_video.');
        }

        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',

                // XXX: Do we need `done` here?
                importer(uri, prev, done) {
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

    _get_dependent_asset_ids() {
        return this._document('[data-soma-job-id]').map(function () {
            return cheerio(this).attr('data-soma-job-id');
        }).get();
    }
}

/**
 * A simple wrapper over VideoAsset that should be used for toplevel videos.
 *
 * This asset type is for videos that aren't embedded as part of another
 * piece of content, but should instead be directly accessible from
 * content listings and search results. For instance, if you were building
 * an app where the only content was videos and those videos required no
 * other context other than some displayable metadata such as the
 * authors and a brief synopsis, then you should use this asset type.
 *
 * In the past, developers used GalleryVideoArticle, which wrapped
 * the video in another HTML page. That asset type is now deprecated
 * since apps are capable of displaying the video and its corresponding
 * metadata correctly without the need for a page in between.
 */
class VideoArticle extends VideoAsset {
    /**
     * Set the author of this document to the given value.
     * The author should be the "creator" of the video, being
     * the person or organization responsible for its production.
     *
     * @param {string} value - The name of the author.
     */
    set_author(value) {
        this._author = value;
    }

    to_metadata() {
        const metadata = super.to_metadata();
        Object.assign(metadata, {
            'authors': [this._author],
        });
        return metadata;
    }
}

/** */
class NewsArticle extends BaseAsset {
    constructor() {
        super();
        this._object_type = 'ArticleObject';
        this._content_type = 'text/html';
        this._authors = [];
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
        this._main_image_caption = _ensureCheerio(caption);
    }

    set_tags(value) {
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
        this._ekn_tags.push(EKN_STATIC_TAG);
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
        this._lede = _fixLinkTargets(_ensureCheerio(value));
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
        this._body = _fixLinkTargets(_ensureCheerio(value));
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

        const templatePath = path.join(__dirname, './assets/news-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const newsStylesheet = path.join(__dirname, './assets/news-stylesheet.scss');

        let stylesheet;
        if (this._custom_scss) {
            stylesheet = sass.renderSync({
                data: this._custom_scss,
                outputStyle: 'compressed',

                // Do we need `done` here?
                importer(uri, prev, done) {
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

    to_metadata() {
        const metadata = super.to_metadata();
        Object.assign(metadata, {
            'document': this._document.html(),
            'authors': this._authors,
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

function isSubset(a, b) {
    for (const item of a) {
        if (!b.has(item)) {
            return false;
        }
    }

    return true;
}

/**
 * Creates the hatch and parses arguments.
 *
 * @param {string} name - A name for the ingester
 * @param {string} language - ISO 3166-1 alpha-2 two-letter language code, for
 *   use in generating spelling and stopwords dictionaries for search
 * @param {Object} options [{}] - A dictionary with options. For a
 * list of available options see {@link
 * configparse_options|config.parse_options}
*/
class Hatch {
    constructor(name, language, options) {
        this._promises = [];
        this._assets = [];
        this._failed_assets = [];
        this._videos = [];

        config.parse_options(options);

        if (!name) {
            throw new Error('ERROR! Hatch name must be specified!');
        }

        // The string check is to ensure that we don't consider older-api
        // `options` as the language which was in this position before
        if (!language || (typeof language !== 'string' && !(language instanceof String))) {
            throw new Error('ERROR! Hatch language must be specified!');
        }

        this._name = name;
        this._language = language;
        this._path = config.get_setting('path') || this._get_default_path();

        if (!fs.existsSync(this._path)) {
            fs.mkdirSync(this._path, 0o775);
        }
    }

    /**
     * Indicates whether the hatch will be compressed into a tar.gz file after
     * it is finished. The original hatch directory will not be removed.
     * @returns {boolean}
     */
    is_exporting_tgz() {
        return !config.get_setting('no-tgz');
    }


    /**
     *  Return an array of URLs if passed as settings.
     *
     *  The ingesters can use this URLs to reingest a batch of
     *  articles.
     * @returns {Array|null}
     */
    get_urls() {
        return config.get_setting('urls') || null;
    }

    /**
     * @returns {string} - The two-letter language code set when creating the
     *   hatch
     */
    get_language() {
        return this._language;
    }

    /**
     * @returns {string} - The name set when creating the hatch
     */
    get_name() {
        return this._name;
    }

    /**
     * @returns {string}
     */
    get_path() {
        return this._path;
    }

    _get_default_path() {
        return `hatch_${this._name.toLowerCase()}_${getTimestamp()}`;
    }

    _purge_failed_assets() {
        // Cache a list of failed asset ids for later
        const failedAssetIds = this._failed_assets.map(asset => asset.asset_id);

        // While we're processing elements in a hierarchical way, let's also
        // keep track of which assets are at the "toplevel", i.e. have no
        // parents
        const allAssetIds = this._assets.concat(this._videos).map(asset => asset.asset_id);
        const toplevelAssetIds = new Set(allAssetIds);

        let dependentsToPrune = [];
        let successfulAssets = this._assets.filter(asset => {
            // If an asset failed, dump it from the hatch
            if (this._failed_assets.includes(asset)) {
                return false;
            }

            // coerce any sets into array form
            const dependents = Array.from(asset.get_dependent_assets());

            // no toplevel asset is a dependent asset
            dependents.forEach(dependentAssetId => {
                toplevelAssetIds.delete(dependentAssetId);
            });

            // If an asset has failed dependents, consider it failed as well
            const hasFailedDependents = dependents.some(dependentAssetId => {
                return failedAssetIds.includes(dependentAssetId);
            });

            if (hasFailedDependents) {
                // keep track of which siblings we'll have to remove in a
                // later pass
                dependentsToPrune = dependentsToPrune.concat(dependents);
                return false;
            }

            return true;
        });

        // In a second pass, remove all otherwise successful assets which had
        // failed siblings
        successfulAssets = successfulAssets.filter(asset => {
            return !dependentsToPrune.includes(asset.asset_id);
        });

        // If this hatch is nonempty and had over 50% failures, consider it
        // failed and refuse to continue
        if (this._assets.length > 0) {
            const percentFailedAssets = 1 - (successfulAssets.length / this._assets.length);
            if (percentFailedAssets > HATCH_FAIL_RATE_THRESHOLD) {
                throw new Error(`More than ${HATCH_FAIL_RATE_THRESHOLD * 100}% ` +
                                'assets failed! Aborting hatch...');
            }
        }

        successfulAssets.forEach(asset => {
            asset._isToplevel = toplevelAssetIds.has(asset.asset_id);
        });

        // Videos just POJOs, so just set the isToplevel attribute directly
        this._videos.forEach(video => {
            video.isToplevel = toplevelAssetIds.has(video.asset_id);
        });

        this._assets = successfulAssets;
    }

    _validate_asset_references() {
        // Assure that all outgoing edges are satisfied.

        // Outgoing edges.
        const outgoing = new Set();

        // Node labels
        const assetIds = new Set();

        this._assets.forEach(asset => {
            assetIds.add(asset.asset_id);
            for (const outgoingAssetId of asset.get_dependent_assets()) {
                outgoing.add(outgoingAssetId);
            }
        });
        this._videos.forEach(video => {
            assetIds.add(video.asset_id);
        });

        // Assert that outgoing edges is contained in asset_ids.
        if (!isSubset(outgoing, assetIds)) {
            throw new ValidationError('Asset references inconsistent');
        }
    }

    // The manifest should contain a subset of the asset's fields needed by the
    // Portal to display the hatch's contents
    _save_hatch_manifest() {
        const assets = this._assets.map(asset => {
            return {
                asset_id: asset.asset_id,
                uri: asset._canonical_uri,
                title: asset._title,
                isToplevel: asset._isToplevel,
            };
        });

        // Sanity check the entries
        assets.forEach(verify.verify_manifest_entry);

        const manifest = { name: this._name,
                           hatch_version: HATCH_VERSION,
                           language: this._language,
                           assets: assets,
                           videos: this._videos };
        const manifestJson = JSON.stringify(manifest, null, 2);

        return fs.writeFile(path.join(this._path, 'hatch_manifest.json'),
                            manifestJson,
                            { encoding: 'utf-8' });
    }

    // Endless provides two buckets by default: dev and prod. If you're
    // ingesting content for use on the production Portal, be sure to set
    // NODE_ENV=production
    _get_default_bucket() {
        const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
        return `com-endless--cloud-soma-${env}-hatch`;
    }

    _create_hatch_archive() {
        const tarballPath = `${this._path}.tar.gz`;
        const tarOptions = {
            gzip: true,
            file: tarballPath,
        };

        return tar.c(tarOptions, [this._path])
            .then(() => tarballPath);
    }

    /**
     * Waits for any pending downloads, creates the hatch manifests, and
     * optionally compresses the archive into a tar.gz file.
     * @returns {Promise}
     */
    finish() {
        logger.info('hatch: waiting for pending downloads...');
        return Promise.all(this._promises)
        .then(() => this._purge_failed_assets())
        .then(() => this._validate_asset_references())
        .then(() => {
            logger.info('hatch: exporting hatch manifest...');
            return this._save_hatch_manifest();
        })
        .then(() => {
            logger.info('hatch: creating hatch tarball...');

            // If we only are saving the dir, we return the path
            if (!this.is_exporting_tgz()) {
                return this._path;
            }

            return this._create_hatch_archive();
        })
        .then(tarballPath => {
            logger.info(`hatch: finished, saved to ${tarballPath}`);
        });
    }

    /**
     * Downloads and processes `asset` into metadata and data objects which
     * will be saved in the hatch.
     * @param {BaseAsset} asset
     */
    save_asset(asset) {
        asset._save_to_hatch(this);
    }

    /**
     * Copies the generated hatch directory to `directory`. This can be used
     * for automating the ingestion of content.
     * @param {string} directory - A path
     */
    copy_to_directory(directory) {
        return fs.copy(this._path, directory);
    }

    /**
     * Copies the generated hatch directory to an S3 bucket on AWS.
     * @param {string} bucket
     */
    copy_to_s3(bucket) {
        const hatchId = path.basename(this._path);

        /* XXX: Configure this to use us-west-2 */
        const s3 = new aws.S3();

        let targetBucket = this._get_default_bucket();
        if (bucket) {
            targetBucket = bucket;
        }

        return fs.readdir(this._path).then(files => {
            const promises = files.map(filename => {
                const fullPath = path.join(this._path, filename);
                return fs.readFile(fullPath).then(contents => {
                    return s3.putObject({
                        Bucket: targetBucket,
                        Key: `${hatchId}/${filename}`,
                        Body: contents,
                    }).promise();
                });
            });

            return Promise.all(promises);
        }).then(() => {
            logger.info(`Hatch copied to http://${targetBucket}.s3.amazonaws.com/${hatchId}`);
        });
    }
}

module.exports = {
    BaseAsset,
    BlogArticle,
    DictionaryAsset,
    GalleryImageArticle,
    GalleryVideoArticle,
    Hatch,
    ImageAsset,
    NewsArticle,
    VideoArticle,
    VideoAsset,
};

module.exports.util = require('./util');
module.exports.logging = require('./logging');
