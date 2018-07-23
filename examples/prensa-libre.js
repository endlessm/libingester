const libingester = require('libingester');

const NO_SUBCATEGORY_SECTIONS = [
    'ciudades',
];

const RELATED_CONTENT_REGEX =
    /(?:contenidos?\s*(?:relacionados?|relaciones))|(?:Lea\s*tambi[e,é]n)/gi;

class PrensaLibreParser extends libingester.HtmlParser {
    // parsePublishedDate ($) {
    //     const time = $('time.sart-time').text();
    //     const result = moment(time, 'D [de] MMMM [de] YYYY [a las] kk:mm[h]', 'es');
    //     return result.isValid() ? result.toDate() : null;
    // }

    parseSection () {
        const parts = this.uri.split('/');

        if (parts.length === 6) {
            // For cases like:
            // http://www.prensalibre.com/vida/escenario/ricardo-arjona-gana...
            if (NO_SUBCATEGORY_SECTIONS.includes(parts[3])) {
                return parts[3];
            }

            return `${parts[3]}/${parts[4]}`;
        }

        // For cases like:
        // http://www.prensalibre.com/internacional/melania-trump-chaqueta-f...
        return parts[3];
    }

    parseAuthors ($) {
        return $('.auth-info .sart-author').text().substring(4);
    }

    parseReadMoreLink () {
        return `Artículo original en <a href="${this.canonicalUri}">prensalibre.com</a>`;
    }

    _isImageLinkEqual (image1, image2) {
        return image1.split('_')[0] === image2.split('_')[0];
    }

    get bodyProcessors () {
        return [
            this.processRelatedContent,
            this.processImages,
            this.processGalleries,
        ];
    }

    extractBody ($) {
        this.mainImageUrl = this.getMeta('og:image');
        return $('.main-content .sart-content');
    }

    processRelatedContent ($body) {
        // Remove related content section from footer
        $body.find('h2, h3').each((i, elem) => {
            const $elem = $body(elem);
            if (RELATED_CONTENT_REGEX.test($elem.text())) {
                $elem.nextAll().each((i2, elem2) => {
                    $body(elem2).remove();
                });
                $elem.remove();
            }
        });
    }

    processImages ($body) {
        // Normalize images
        $body.find('figure img').each((i, elem) => {
            const $img = $body(elem);
            const $originalFigure = $img.parent();

            if (this._isImageLinkEqual(this.mainImage.canonicalUri, $img.attr('src'))) {
                $originalFigure.remove();
                return;
            }

            const imageCaption = $originalFigure.find('figcaption').html();

            const imageAsset = this.createImageAsset($img.attr('src'), imageCaption);
            $originalFigure.replaceWith(imageAsset.render());
        });
    }

    processGalleries ($body) {
        $body.find('.photogallery').each((i, photoGallery) => {
            const $photoGallery = $(photoGallery);

            $photoGallery.find('.photo').each((j, photo) => {
                const $img = $body(photo).find('img');
                if ($img.length > 0) {
                    const imageCaption = $body(photo).find('figcaption').html();

                    const imageAsset = this.createImageAsset($img.attr('src'), imageCaption);
                    imageAsset.render().insertBefore($photoGallery.parent().parent());
                }
            });

            $photoGallery.parent().parent().remove();
        });
    }
}

// FIXME UriListIngester --> Ingester
class PrensaLibreIngester extends libingester.Ingester {
    get parserClass () {
        return PrensaLibreParser;
    }

    get language () {
        return 'es';
    }

    get uriSources () {
        return [
            new libingester.FeedGenerator([
                'http://www.prensalibre.com/rss?rss=Guatemala',
                'http://www.prensalibre.com/rss?rss=Deportes',
                'http://www.prensalibre.com/rss?rss=Economia',
                'http://www.prensalibre.com/rss?rss=Vida',
                'http://www.prensalibre.com/rss?rss=Internacional',
                'http://www.prensalibre.com/smartTV/departamental.xml',
            ]).getUris(),
        ];
    }
}

new PrensaLibreIngester().run();
