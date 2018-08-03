'use strict';

const Cheerio = require('cheerio');
const {dom, out, props, rule, ruleset, score, type} = require('fathom-web');
const Futils = require('fathom-web/utils');
const JSDOM = require('jsdom/lib/old-api');
const Libingester = require('libingester');
const url = require('url');
const util = require('util');
const {Vimeo} = require('vimeo');
const Youtubedl = require('youtube-dl');

Youtubedl.getInfo = util.promisify(Youtubedl.getInfo);

const feedURI = 'https://creativecommons.org/blog/feed/';

const vimeoClientID = '(fill in client ID here)';
const vimeoClientSecret = '(fill in client secret here)';

const ensureVimeoClient = (function () {
    let vimeo;
    return async function ensureVimeoClient() {
        if (vimeo)
            return vimeo;

        vimeo = new Vimeo(vimeoClientID, vimeoClientSecret);
        vimeo.generateClientCredentials =
            util.promisify(vimeo.generateClientCredentials.bind(vimeo));
        vimeo.request = util.promisify(vimeo.request.bind(vimeo));

        const {access_token: accessToken} =
            await vimeo.generateClientCredentials(['public']);
        vimeo.setAccessToken(accessToken);
        return vimeo;
    };
})();

async function getVideoInfo(vimeoID) {
    const vimeo = await ensureVimeoClient();
    const fields = ['description', 'license', 'link', 'name',
        'modified_time', 'pictures', 'privacy', 'release_time', 'tags'];
    return await vimeo.request({
        method: 'GET',
        path: `/videos/${vimeoID}?fields=${fields.join(',')}`
    });
}

function licenseFromVimeoLicense(license) {
    switch (license) {
    case 'by':
        return 'CC BY 3.0';
    case 'by-nc':
        return 'CC BY-NC 3.0';
    default:
        console.warn(`Unknown license ${license}`);
        return null;
    }
}

function tagsFromVimeoTags(tags) {
    return tags.map(({name}) => name);
}

function scoreByLength(fnode) {
    let length = Futils.inlineTextLength(fnode.element) * 2;
    if (Number.isNaN(length))
        length = 0;  // Penalize empty nodes
    return {
        score: length,
        note: {length},
    };
}

function byInverseLinkDensity(fnode) {
    const linkDensity = Futils.linkDensity(fnode,
        fnode.noteFor('paragraphish').length);
    if (Number.isNaN(linkDensity))
        return 1;
    return (1 - linkDensity) * 1.5;
}

function scoreByImageSize(fnode) {
    const img = fnode.element.querySelector('img');
    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    let length = Futils.inlineTextLength(fnode.element) * 2;
    if (Number.isNaN(length))
        length = 1;  // Don't penalize empty captions
    return {
        score: width && height ? width * height / 100 : 100,
        note: {length},
    };
}

const hasAncestor = (tagName, scoreIfHas) => fnode => {
    const lowerTag = tagName.toLowerCase();
    for (let element = fnode.element, parent;
        (parent = element.parentNode) != null &&
            parent.nodeType === parent.ELEMENT_NODE;
        element = parent) {
        if (element.tagName.toLowerCase() === lowerTag)
            return scoreIfHas;
    }
    return 1;
};

const rules = ruleset(
    // Isolate the actual blog post body text. Based on Fathom's example
    // Readability rules
    rule(dom('p,li,ol,ul,code,blockquote,pre,h1,h2,h3,h4,h5,h6'),
        props(scoreByLength).type('paragraphish')),
    rule(type('paragraphish'), score(byInverseLinkDensity)),
    rule(dom('p'), score(4.5).type('paragraphish')),

    // Tweaks for this particular blog
    rule(type('paragraphish'), score(hasAncestor('article', 10))),
    rule(dom('.entry-summary p'), score(0).type('paragraphish')),
    rule(dom('figure'), props(scoreByImageSize).type('paragraphish')),
    rule(dom('.jetpack-video-wrapper'), props(() => ({
        score: 100,
        note: {length: 1},
    })).type('paragraphish')),

    // Find the best cluster of paragraph-ish nodes
    rule(
        type('paragraphish').bestCluster({
            splittingDistance: 3,
            differentDepthCost: 6.5,
            differentTagCost: 2,
            sameTagCost: 0.5,
            strideCost: 0,
        }),
        out('content').allThrough(Futils.domSort)));

// FIXME: TODO: blog article, render template, custom SCSS
class TutorialParser extends Libingester.HTMLArticleParser {

    parseTitle ($) {
        return super.parseTitle($).replace(/ - Creative Commons$/,'');
    }

    parseLastModifiedDate ($) {
        // FIXME make it a metascraper rule
        return $('meta[property="article:modified_time"]').attr('content');
    }

    parseLicense () {
        return 'CC BY 4.0 International';
    }

    parseReadMoreText ($) {
        // FIXME parsers dependencies
        const title = this.parseTitle($);
        const author = this.parseAuthors($);
        return `"${title}" by ${author}, used under CC BY 4.0 International / Reformatted from original`;
    }

    parseTags ($) {
        // Wordpress distinguishes predefined "categories" and free-form "tags".
        // We are likely to make Wordpress categories into featured sets, and
        // Wordpress tags non-featured. For now, we will mark the tag IDs of
        // Wordpress tags with "tag:".
        const wpCategory = $('meta[property="article:section"]')
              .attr('content');
        const wpTags = $('meta[property="article:tag"]')
              .map(function () { return $(this).attr('content'); })
              .get();
        const tags = wpTags.map(t => `tag:${t}`);
        tags.unshift(wpCategory);
        return tags;
    }

    get bodyProcessors () {
        return [
            this.processWithFathom,
            this.processVimeoEmbeds,
            ...super.bodyProcessors,
        ];
    }

    processWithFathom ($body) {
        const dom = JSDOM.jsdom($body.html(), {
            features: {ProcessExternalResources: false},
        });
        const facts = rules.against(dom);
        const html = facts.get('content')
              .filter(fnode => fnode.scoreFor('paragraphish') > 0)
              .map(fnode => fnode.element.outerHTML).join('');

        // Load the DOM back into Cheerio
        const $ = Cheerio.load('<article>');
        $('article').append(html);

        return { $body: $('article') };
    }

    async processVimeoEmbeds ($body) {
        const videoAssets = [];

        // Identify embedded videos, put them in a <figure>, and mark them for
        // downloading
        const videosToProcess = $body.find('.jetpack-video-wrapper')
              .map(function () {
                  const iframe = Cheerio('.embed-vimeo iframe', this).first();
                  let figure;
                  if (iframe) {
                      figure = Cheerio('<figure></figure>');
                      figure.append(iframe);
                      figure = figure.insertAfter(this);
                  }
                  Cheerio(this).remove();
                  return figure;
              })
              .get().filter(figure => !!figure);

        await Promise.all(videosToProcess.map(async figure => {
            const iframe = figure.find('iframe');
            const {host, pathname} = url.parse(iframe.attr('src'));
            if (host !== 'player.vimeo.com') {
                Cheerio(iframe).remove();
                return;
            }

            const [,, vimeoID] = pathname.split('/');
            const {
                description, license, link, name, pictures, privacy, tags,
                release_time: releaseTime,
                modified_time: modifiedTime,
            } = await getVideoInfo(vimeoID);

            // Only download if Vimeo says it is allowed and the license allows
            // redistribution
            const freeLicense = licenseFromVimeoLicense(license);
            if (!privacy.download || !freeLicense) {
                Cheerio(iframe).remove();
                return;
            }

            // Try to get the smallest file size in a free codec
            const {url: downloadURL} = await Youtubedl.getInfo(link, [
                '--prefer-free-formats',
                '--format=worst',
            ], {
                maxBuffer: 500 * 1024,  // JSON info is big!
            });

            const video = new Libingester.Asset();

            video.setMetadata({
                objectType: Libingester.Asset.VIDEO_OBJECT_TYPE,
                canonicalURI: link,
                title: name,
                synopsis: description,
                publishedDate: releaseTime,
                lastModifiedDate: modifiedTime,
                license: freeLicense,
                tags: tagsFromVimeoTags(tags),
            });
            videoAssets.push(video);

            // FIXME video placeholder
            // FIXME thumbnail asset

            // const video = Libingester.util.get_embedded_video_asset(iframe,
            //                                                         downloadURL);

            // const posterFrame = pictures.sizes.pop();
            // const poster = Libingester.util.download_image(posterFrame.link);
            // video.set_thumbnail(poster);

            // hatch.save_asset(video);
            // hatch.save_asset(poster);
        }));

        return { $body, assets: videoAssets };
    }

}

class TutorialIngester extends Libingester.WebIngester {
    get parserClass () {
        return TutorialParser;
    }

    get uriSources () {
        return [
            ['https://creativecommons.org/2018/04/15/fellowship-memorial-fund/'],
            // new Libingester.FeedGenerator(feedURI).getUris(),
        ];
    }
}

new TutorialIngester(__dirname).run();
