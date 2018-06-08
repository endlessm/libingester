// eslint-disable-next-line no-nested-ternary
'use strict';

const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');

const BaseAsset = require('./baseAsset');
const { ensureCheerio, fixLinkTargets } = require('./util');

class DictionaryAsset extends BaseAsset {
    get ALLOWED_METADATA() {
        const allowed = ['word', 'definition', 'part_of_speech', 'source', 'body',
                         'custom_scss', 'main_image'];
        return new Set([...super.ALLOWED_METADATA, ...allowed]);
    }

    constructor(metadata = {}) {
        super(metadata);

        this._object_type = 'DictionaryWordObject';
        this._content_type = 'text/html';
    }

    /**
     * Set multiple metadata at once.
     * @augments BaseAsset#set_metadata
     * @param {Object} metadata - The metadata can be:
     * @param {string} metadata.word - See {@link DictionaryAsset#set_word}.
     * @param {string} metadata.definition - See {@link DictionaryAsset#set_definition}.
     * @param {string} metadata.part_of_speech - See {@link DictionaryAsset#set_part_of_speech}.
     * @param {string} metadata.source - See {@link DictionaryAsset#set_source}.
     * @param {(string|Cheerio)} metadata.body - See {@link DictionaryAsset#set_body}.
     * @param {string} metadata.custom_scss - See {@link DictionaryAsset#set_custom_scss}.
     * @param {ImageAsset} metadata.main_image - See {@link DictionaryAsset#set_main_image}.
     */
    set_metadata(metadata) {
        super.set_metadata(metadata);

        if (typeof metadata.word !== 'undefined') {
            this.set_word(metadata.word);
        }
        if (typeof metadata.definition !== 'undefined') {
            this.set_definition(metadata.definition);
        }
        if (typeof metadata.part_of_speech !== 'undefined') {
            this.set_part_of_speech(metadata.part_of_speech);
        }
        if (typeof metadata.source !== 'undefined') {
            this.set_source(metadata.source);
        }
        if (typeof metadata.body !== 'undefined') {
            this.set_body(metadata.body);
        }
        if (typeof metadata.custom_scss !== 'undefined') {
            this.set_custom_scss(metadata.custom_scss);
        }
        if (typeof metadata.main_image !== 'undefined') {
            this.set_main_image(metadata.main_image);
        }
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

    set_source(value) {
        this._source = value;
    }

    set_body(value) {
        this._body = fixLinkTargets(ensureCheerio(value));
    }

    set_custom_scss(value) {
        this._custom_scss = value;
    }

    set_main_image(value) {
        this._main_image = value;
    }

    to_hatch_metadata() {
        const metadata = super.to_hatch_metadata();
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

        const templatePath = path.join(__dirname, '..', '..',
                                       'data/assets/dictionary-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const dictionaryStylesheet = path.join(__dirname, '..', '..',
                                               'data/assets/news-stylesheet.scss');

        const sassOptions = {
            outputStyle: 'compressed',
        };

        if (this._custom_scss) {
            sassOptions.data = this._custom_scss;
            sassOptions.importer = uri => {
                if (uri === '_default') {
                    return {
                        file: dictionaryStylesheet,
                    };
                }

                // Default handler
                return null;
            };
        } else {
            sassOptions.file = dictionaryStylesheet;
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

module.exports = DictionaryAsset;
