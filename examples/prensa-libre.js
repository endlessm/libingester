const cheerio = require('cheerio');

const libingester = require('libingester');

const NO_SUBCATEGORY_SECTIONS = [
    'ciudades',
];

const RELATED_CONTENT_REGEX =
    /(?:contenidos?\s*(?:relacionados?|relaciones))|(?:Lea\s*tambi[e,é]n)/gi;

class PrensaLibreParser extends libingester.HTMLArticleParser {
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
            libingester.processors.processCleanup({
                remove: [
                    '[data-desktop*=".floating-aside"]',
                    '[data-desktop*=".advice-wrap"]',
                    '[data-mobile*=".floating-advice"]',
                    '[data-tablet*=".floating-advice"]',
                    '.subscribe-module',
                    '#divInline_Notas',
                    'article',
                    'br',
                ],
            }),
            this.processRelatedContent,
            this.processImages,
            this.processGalleries,
            ...super.bodyProcessors,
        ];
    }

    extractBody ($) {
        this.mainImageUrl = this.getMeta('og:image');
        return $('.main-content .sart-content');
    }

    processRelatedContent ($body) {
        // Remove related content section from footer
        $body.find('h2, h3').each((i, elem) => {
            const $elem = cheerio(elem);
            if (RELATED_CONTENT_REGEX.test($elem.text())) {
                $elem.nextAll().each((i2, elem2) => {
                    cheerio(elem2).remove();
                });
                $elem.remove();
            }
        });

        return { $body };
    }

    processImages ($body) {
        const assets = [];
        const self = this;

        // Normalize images
        $body.find('figure img').each((i, elem) => {
            const $img = cheerio(elem);
            const $originalFigure = $img.parent();

            if (self._isImageLinkEqual(self.mainImageUrl, $img.attr('src'))) {
                $originalFigure.remove();
                return;
            }

            const imageCaption = $originalFigure.find('figcaption').html();

            const imageAsset = libingester.processors.createImageAsset(
                libingester.processors.getImageSource($img),
                imageCaption
            );
            imageAsset.replaceWithAssetTag($originalFigure);

            assets.push(imageAsset);
        });

        return { $body, assets };
    }

    processGalleries ($body) {
        const assets = [];

        $body.find('.photogallery').each((i, photoGallery) => {
            const $photoGallery = cheerio(photoGallery);

            $photoGallery.find('.photo').each((j, photo) => {
                const $img = cheerio(photo).find('img');
                if ($img.length > 0) {
                    const imageCaption = $body(photo).find('figcaption').html();

                    const imageAsset = libingester.processors.createImageAsset(
                        libingester.processors.getImageSource($img),
                        imageCaption
                    );

                    $photoGallery.parent().parent().before(imageAsset.getAssetTag());
                    assets.push(imageAsset);
                }
            });

            $photoGallery.parent().parent().remove();
        });

        return { $body, assets };
    }
}

class PrensaLibreIngester extends libingester.WebIngester {
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

new PrensaLibreIngester(__dirname).run();
