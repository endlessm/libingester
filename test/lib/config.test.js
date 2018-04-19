'use strict';

const expect = require('chai').expect;

const config = require('../../lib/config');


describe('config', function() {
    beforeEach(() => {
        config.clean();
    });
    afterEach(() => {
        config.clean();
    });
    it('can parse options correctly', function() {
        const options = { argv: ["--path", "/tmp/mypath",
                                 "--no-tgz",
                                 "--urls", "https://foo.com", "https://bar.com"] };
        config.parse_options(options);
        expect(config.get_setting('path')).to.equal("/tmp/mypath");
        expect(config.get_setting('no-tgz')).to.be.true;
        expect(config.get_setting('urls')).to.have.members(["https://foo.com",
                                                            "https://bar.com"]);
    });

    it('can update options', function() {
        config.parse_options({ argv: ["--path", "/tmp/mypath",
                                      "--no-tgz"] });
        expect(config.get_setting('path')).to.equal("/tmp/mypath");
        expect(config.get_setting('no-tgz')).to.be.true;

        config.parse_options({ argv: ["--path", "/tmp/my-new-path"] });
        expect(config.get_setting('path')).to.equal("/tmp/my-new-path");
        expect(config.get_setting('no-tgz')).to.be.true;
    });

    it('can override default options', function() {
        config.parse_options();
        expect(config.get_setting('max-retries')).to.equal("3");
        expect(config.get_setting('retry-backoff-delay')).to.equal("800");
        config.parse_options({ argv: ["--max-retries", "10",
                                      "--retry-backoff-delay", "1000"] });
        expect(config.get_setting('max-retries')).to.equal("10");
        expect(config.get_setting('retry-backoff-delay')).to.equal("1000");
    });
});
