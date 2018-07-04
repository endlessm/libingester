'use strict';

const winston = require('winston');

let level = 'info';
if (process.env.DEBUG && process.env.DEBUG.includes('libingester')) {
    level = 'debug';
}

winston.configure({
    transports: [new winston.transports.Console({
        level,
        prettyPrint: true,
        colorize: true,
        handleExceptions: true,
        humanReadableUnhandledException: true,
    })],
});

process.on('unhandledRejection', (reason, promise) => {
    winston.error('Unhandled promise rejection at:', promise, 'reason:', reason);
    process.exitCode = 1;
});

module.exports = winston;
