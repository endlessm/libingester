'use strict';

const VideoAsset = require('./videoAsset');

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
    get ALLOWED_METADATA() {
        return new Set([ ...super.ALLOWED_METADATA, 'author' ]);
    }

    /**
     * Set multiple metadata at once.
     * @augments VideoAsset#set_metadata
     * @param {Object} metadata - The metadata can be:
     * @param {string} metadata.author - See {@link VideoArticle#set_author}.
     */
    set_metadata(metadata) {
        super.set_metadata(metadata);

        Object.entries(metadata).forEach(([ key, value ]) => {
            if (key === 'author') {
                this.set_author(value);
            }
        });
    }

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

    to_hatch_metadata() {
        const metadata = super.to_hatch_metadata();
        Object.assign(metadata, {
            'authors': [this._author],
        });
        return metadata;
    }
}

module.exports = VideoArticle;
