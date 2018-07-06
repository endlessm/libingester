'use strict';

const { createLogger, format, transports } = require('winston');

const { config } = require('./config');

class Logger {
    constructor () {
        this._transports = [
            new transports.Console(),
        ];

        this._format = format.combine(
            format.colorize(),
            format.timestamp(),
            format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
        );

        this._logger = createLogger({
            level: this.level,
            format: this._format,
            transports: this._transports,
        });
    }

    get level () {
        if (config.verbose) {
            return 'debug';
        }
        return 'info';
    }

    onConfigChange () {
        this._logger.configure({
            level: this.level,
            format: this._format,
            transports: this._transports,
        });
    }

    get logger () {
        return this._logger;
    }
}

module.exports = new Logger();
