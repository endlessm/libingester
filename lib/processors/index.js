module.exports = {
    ...require('./cleanup'),
    ...require('./image-embeds'),
    ...require('./youtube-embeds'),
    ...require('./twitter-embeds'),
    ...require('./instagram-embeds'),
    ...require('./normalize-headers'),
    ...require('./canonicalize-links'),
};
