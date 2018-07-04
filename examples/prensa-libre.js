const libingester = require('libingester');

class PrensaLibreArticle extends libingester.NewsArticle {
    parsePublishedDate ($) {
        const time = $('time.sart-time').text();
        const result = moment(time, 'D [de] MMMM [de] YYYY [a las] kk:mm[h]', 'es');
        return result.isValid() ? result.toDate() : null;
    }

    parseSection ($) {
        const parts = this.uri.split('/');

        if (parts.length === 6) {
            // For cases like:
            // http://www.prensalibre.com/vida/escenario/ricardo-arjona-gana-bat...
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

    parseReadMoreLink ($) {
        return `Artículo original en <a href="${this.canonicalUri}">prensalibre.com</a>`;
    }

    _isImageLinkEqual (image1, image2) {
        return image1.split('_')[0] === image2.split('_')[0];
    }

    createBodyCleaner () {
        return new libingester.StandardBodyCleaner(
            {
                removeElements: [
                    '[data-desktop*=".floating-aside"]',
                    '[data-desktop*=".advice-wrap"]',
                    '[data-mobile*=".floating-advice"]',
                    '[data-tablet*=".floating-advice"]',
                    '.subscribe-module',
                    '#divInline_Notas',
                    'article',
                    'br',
                ],
                removeNoText: [
                    'div',
                ],
            },
            {
                extendDefaults: true, // or ['removeElements', 'removeNoText']
            }
        );
    }

    parseBody ($) {
        // Main image
        this.mainImage = this.createImageAsset(this.getMeta($, 'og:image'), this.title);

        // Body
        const $body = $('.main-content .sart-content');

        // Remove related content section from footer

        $body.find('h2, h3').each((i, elem) => {
            const $elem = $(elem);
            if (RELATED_CONTENT_REGEX.test($elem.text())) {
                $elem.nextAll().each((i2, elem2) => {
                    $(elem2).remove();
                });
                $elem.remove();
            }
        });

        // Normalize images
        $('figure img').each((i, elem) => {
            const $img = $(elem);
            const $originalFigure = $img.parent();

            if (this._isImageLinkEqual(this.mainImage.canonicalUri, $img.attr('src'))) {
                $originalFigure.remove();
                return;
            }

            const imageCaption = $originalFigure.find('figcaption').html();

            const imageAsset = this.createImageAsset($img.attr('src'), imageCaption);
            $originalFigure.replaceWith(imageAsset.render());
        });

        // Parse galleries
        $('.photogallery').each((i, photoGallery) => {
            const $photoGallery = $(photoGallery);

            $photoGallery.find('.photo').each((j, photo) => {
                const $img = $(photo).find('img');
                if ($img.length > 0) {
                    const imageCaption = $(photo).find('figcaption').html();

                    const imageAsset = this.createImageAsset($img.attr('src'), imageCaption);
                    imageAsset.render().insertBefore($photoGallery.parent().parent());
                }
            });

            $photoGallery.parent().parent().remove();
        });

        return $body;
    }
}

class PrensaLibreIngester extends libingester.FeedIngester {
    createArticle () {
        return new PrensaLibreArticle();
    }

    get language () {
        return 'es';
    }

    get feedUris () {
        return [
            'http://www.prensalibre.com/rss?rss=Guatemala',
            'http://www.prensalibre.com/rss?rss=Deportes',
            'http://www.prensalibre.com/rss?rss=Economia',
            'http://www.prensalibre.com/rss?rss=Vida',
            'http://www.prensalibre.com/rss?rss=Internacional',
            'http://www.prensalibre.com/smartTV/departamental.xml',
        ];
    }
}

new PrensaLibreIngester().run();
