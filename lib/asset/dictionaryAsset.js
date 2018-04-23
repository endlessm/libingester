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
        this._body = fixLinkTargets(ensureCheerio(value));
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

        const templatePath = path.join(__dirname, '..', 'data/assets/dictionary-article.mst');
        const template = fs.readFileSync(templatePath, 'utf8');

        const dictionaryStylesheet = path.join(__dirname, '..', 'data/assets/news-stylesheet.scss');

        const sassOptions = {
            outputStyle: 'compressed',
        };

        if (this._custom_scss) {
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
