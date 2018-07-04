const yargs = require('yargs');

class Ingester {
    constructor () {
        this.cliConfig = null;
        this.fileConfig = null;
        this.hatchPath = null;
        this.hatchManifest = null;
    }

    get name () {
        // TODO
    }

    get language () {
        return 'en';
    }

    parseConfig () {
        return yargs
            .strict()
            .option('tgz', {
                default: false,
                type: 'boolean',
            })
            .option('path', {
                type: 'string',
            })
            .parse();

    }

    run () {
        console.log(this.parseConfig());
    }
}

module.exports = Ingester;
