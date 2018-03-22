'use strict';

const winston = require('winston');

let level = 'info';
if (process.env.DEBUG && process.env.DEBUG.includes('libingester'))
    level = 'debug';

winston.configure({
    transports: [new winston.transports.Console({
        level,
        colorize: true,
        handleExceptions: true,
        humanReadableUnhandledException: true,
    })],
});
exports.winston = winston;
