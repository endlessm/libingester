class FetchHtmlError extends Error {
}

class ImplementationError extends Error {
    constructor (methodName) {
        super(`You have to implement ${methodName}`);
    }
}

class OptionalImportError extends Error {
    constructor (moduleId, dependencyName) {
        super(`Module ${moduleId} needs optional package ${dependencyName}`);
    }
}

class IngestError extends Error {
}

module.exports = {
    FetchHtmlError,
    ImplementationError,
    IngestError,
    OptionalImportError,
};
