'use strict';

const expect = require('chai').expect;

const verifier = require('../../../lib/asset/verifier');

const basicMetadata = {
    'assetID': '03d9d97e112b3b4513d246bda42c853656f200e8',
    'objectType': 'ImageObject',
    'contentType': 'image/jpeg;charset=UTF-8',
    'canonicalURI': 'https://stillmed.olympic.org/media/Videos/2012/06/29/Flying%20Finn%20Ritola%20signs%20off%20with%20fifth%20gold/Flying%20Finn%20Ritola%20signs%20off%20with%20fifth%20gold_thumbnail.jpg?interpolation=lanczos-none&resize=*:185',
    'matchingLinks': [
        'https://stillmed.olympic.org/media/Videos/2012/06/29/Flying%20Finn%20Ritola%20signs%20off%20with%20fifth%20gold/Flying%20Finn%20Ritola%20signs%20off%20with%20fifth%20gold_thumbnail.jpg?interpolation=lanczos-none&resize=*:185',
    ],
    'tags': [],
    'lastModifiedDate': '2017-03-10T23:25:20.765Z',
    'revisionTag': '2017-03-10T23:25:20.765Z',
    'cdnFilename': '03d9d97e112b3b4513d246bda42c853656f200e8.data',
};

describe('verifier', () => {
    it('passes real metadata correctly', () => {
        expect(() => verifier.verify_metadata(basicMetadata)).not.to.throw();
    });

    it('fails fake metadata', () => {
        expect(() => verifier.verify_metadata({})).to.throw();
    });

    it('tests asset IDs correctly', () => {
        const fakeIdMetadata = Object.assign({}, basicMetadata, { 'assetID': '12345' });
        expect(() => verifier.verify_metadata(fakeIdMetadata)).to.throw();
    });

    it('tests tags correctly', () => {
        const badTagsMetadata = Object.assign({}, basicMetadata,
                                              { 'tags': [
                                                  [ 'A', 'B' ],
                                              ] });
        expect(() => verifier.verify_metadata(badTagsMetadata)).to.throw();
    });
});
