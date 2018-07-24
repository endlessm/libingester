class FetchHtmlError extends Error {
}

class ImplementationError extends Error {
    constructor (methodName) {
        super(`You have to implement ${methodName}`);
    }
}

class IngestError extends Error {
}

module.exports = {
    FetchHtmlError,
    ImplementationError,
    IngestError,
};
