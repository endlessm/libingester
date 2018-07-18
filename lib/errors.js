class FetchHtmlError extends Error {
}

class ImplementationError extends Error {
    constructor (methodName) {
        super(`You have to implement ${methodName}`);
    }
}

module.exports = {
    FetchHtmlError,
    ImplementationError,
};
