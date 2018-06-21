'use strict';

const expect = require('chai').expect;

const config = require('../../lib/config');


describe('config', () => {
    let processArgvRestore;

    beforeEach(() => {
        config.clean();
        processArgvRestore = process.argv;
    });
    afterEach(() => {
        config.clean();
        process.argv = processArgvRestore;
    });
    it('can parse options correctly', () => {
        const options = { argv: [ '--path', '/tmp/mypath',
                                  '--no-tgz',
                                  '--urls', 'https://foo.com', 'https://bar.com' ] };
        config.parse_options(options);
        expect(config.get_setting('path')).to.equal('/tmp/mypath');
        expect(config.get_setting('no-tgz')).to.be.true;
        expect(config.get_setting('urls')).to.have.members([ 'https://foo.com',
                                                             'https://bar.com' ]);
    });

    it('can update options', () => {
        config.parse_options({ argv: [ '--path', '/tmp/mypath',
                                       '--no-tgz' ] });
        expect(config.get_setting('path')).to.equal('/tmp/mypath');
        expect(config.get_setting('no-tgz')).to.be.true;

        config.parse_options({ argv: [ '--path', '/tmp/my-new-path' ] });
        expect(config.get_setting('path')).to.equal('/tmp/my-new-path');
        expect(config.get_setting('no-tgz')).to.be.true;
    });

    it('can override default options', () => {
        config.parse_options();
        expect(config.get_setting('max-retries')).to.equal('3');
        expect(config.get_setting('retry-backoff-delay')).to.equal('800');
        config.parse_options({ argv: [ '--max-retries', '10',
                                       '--retry-backoff-delay', '1000' ] });
        expect(config.get_setting('max-retries')).to.equal('10');
        expect(config.get_setting('retry-backoff-delay')).to.equal('1000');
    });

    it('can pass command line arguments', () => {
        process.argv = [ 'node', 'my-ingester', '--path', '/tmp/mypath' ];
        config.parse_options();
        expect(config.get_setting('path')).to.equal('/tmp/mypath');
    });

    it('updates command line arguments', () => {
        process.argv = [ 'node', 'my-ingester', '--path', '/tmp/mypath',
                         '--no-tgz' ];
        const options = { argv: [ '--path', './myNewPath' ] };
        config.parse_options(options);
        expect(config.get_setting('path')).to.equal('./myNewPath');
        expect(config.get_setting('no-tgz')).to.be.true;
    });
});
