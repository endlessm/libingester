const cheerio = require('cheerio');

const cleanupHtmlDefaults = {
    remove: [ 'script', 'noscript', 'style', 'iframe', 'object', 'hr', 'br + br', 'center' ],
    removeNoText: ['p', 'div'],
    removeData: ['*'],
    removeEvents: ['*'],
    removeAttrs: {
        '*': [
            'style', 'class', 'align',
        ],
        'img': [
            'border', 'crossorigin', 'height', 'hspace', 'ismap', 'longdesc',
            'sizes', 'src', 'srcset', 'usemap', 'vspace', 'width',
        ],
        'a': ['target'],
    },
    cleanJavaScriptHref: true,
    noComments: true,
};

const cleanupHtmlEmptyDefaults = {
    remove: [],
    removeNoText: [],
    removeData: [],
    removeEvents: [],
    removeAttrs: {},
    cleanJavaScriptHref: false,
    noComments: false,
};

function _removeMatchingAttributes ($html, selector, regex) {
    $html.find(selector)
        .each((i, elem) => {
            Object.keys(elem.attribs).forEach(key => {
                if (key.match(regex)) {
                    cheerio(elem).removeAttr(key);
                }
            });
        });
}

function cleanupHtml ($html, {
    remove = cleanupHtmlDefaults.remove,
    // removeNoText = cleanupHtmlDefaults.removeNoText,
    removeData = cleanupHtmlDefaults.removeData,
    removeEvents = cleanupHtmlDefaults.removeEvents,
    removeAttrs = cleanupHtmlDefaults.removeAttrs,
    cleanJavaScriptHref = cleanupHtmlDefaults.cleanJavaScriptHref,
    noComments = cleanupHtmlDefaults.noComments,
} = {}) {
    $html.find(remove.join(',')).remove();

    // $html.find(removeNoText.join(','))
    //     .filter((i, elem) => cheerio(elem).text().trim() === '')
    //     .remove();

    const dataRegex = /^data-(?!(soma|libingester)-).*$/gi;
    _removeMatchingAttributes($html, removeData.join(','), dataRegex);

    const eventRegex = /^on.*$/gi;
    _removeMatchingAttributes($html, removeEvents.join(','), eventRegex);

    Object.entries(removeAttrs).forEach(([ selector, attrs ]) => {
        attrs.forEach(attr => {
            $html.find(selector)
                .removeAttr(attr);
        });
    });

    if (cleanJavaScriptHref) {
        $html.find('a[href^="javascript"]').attr('href', '#');
    }

    if (noComments) {
        const allElems = $html.contents().add($html.find('*').contents());
        allElems.filter((index, node) => node.type === 'comment')
            .remove();
    }
}

module.exports = {
    cleanupHtmlDefaults,
    cleanupHtmlEmptyDefaults,
    cleanupHtml,
};
