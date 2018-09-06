module.exports = {
    ...require('./cleanup-processor'),
    ...require('./images-processor'),
    ...require('./youtube-embeds-processor'),
    ...require('./normalize-headers-processor'),
};
