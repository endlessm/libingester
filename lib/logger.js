'use strict';

const { createLogger, format, transports } = require('winston');

const config = require('./config');

class Logger {
    initialize () {
        this._logger = createLogger({
            level: config.verbose >= 1 ? 'debug' : 'info',
            format: format.combine(
                format.colorize(),
                format.timestamp(),
                format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
            ),
            transports: [
                new transports.Console(),
            ],
        });
    }

    get logger () {
        return this._logger;
    }
}

const loggerHandler = {
    get: (target, prop) => {
        if (target[prop]) {
            return target[prop];
        }

        return target.logger[prop];
    },
};

module.exports = new Proxy(new Logger(), loggerHandler);
