const { OptionalImportError } = require('../errors');

module.exports = function (dependencyName, options) {
    try {
        if (dependencyName[0] in { '.': 1 }) {
            const _dependencyName = process.cwd() + dependencyName.substr(1);
            return require(_dependencyName);
        }
        return require(dependencyName);
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND' && options && options.rethrow) {
            throw new OptionalImportError(options.moduleId, dependencyName);
        }
    }
    return null;
};
