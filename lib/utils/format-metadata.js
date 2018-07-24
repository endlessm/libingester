'use strict';

function formatMetadata (obj, mapping) {
    for (const [oldKey, newKey] of Object.entries(mapping)) {
        if (oldKey in obj) {
            obj[newKey] = obj[oldKey];
            delete obj[oldKey];
        }
    }
    return obj;
}

module.exports = formatMetadata;
