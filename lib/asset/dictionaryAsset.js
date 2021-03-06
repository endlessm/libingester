'use strict';

const path = require('path');

const cheerio = require('cheerio');
const fs = require('fs-extra');
const mustache = require('mustache');
const sass = require('node-sass');

const BaseAsset = require('./baseAsset');
const { fixLinks } = require('./util');

class DictionaryAsset extends BaseAsset {
    get ALLOWED_METADATA() {
        const allowed = [ 'word', 'definition', 'part_of_speech', 'source', 'body',
                          'custom_scss', 'main_image' ];
        return new Set([ ...super.ALLOWED_METADATA, ...allowed ]);
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

        Object.entries(metadata).forEach(([ key, value ]) => {
            switch (key) {
            case 'word':
                this.set_word(value);
                break;
            case 'definition':
                this.set_definition(value);
                break;
            case 'part_of_speech':
                this.set_part_of_speech(value);
                break;
            case 'source':
                this.set_source(value);
                break;
            case 'body':
                this.set_body(value);
                break;
            case 'custom_scss':
                this.set_custom_scss(value);
                break;
            case 'main_image':
                this.set_main_image(value);
                break;
            }
        });
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
        this._body = fixLinks(value, this._canonical_uri);
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
