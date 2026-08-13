// ==UserScript==
// @name         Reddit Media Downloader - Zero Trust
// @namespace    reddit-media-downloader
// @version      2.1.0
// @description  Securely download Reddit post and comment media.
// @author       mrkwxopya
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @run-at       document-idle
//
// @license MIT
//
// @grant        GM_download
//
// @connect      i.redd.it
// @connect      preview.redd.it
// @connect      external-preview.redd.it
// @connect      v.redd.it
//
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    /*
     * ============================================================
     * CONFIG
     * ============================================================
     */

    const CONFIG = Object.freeze({
        DOWNLOAD_FOLDER: 'reddit-posts',
        BUTTON_TEXT: 'Download',
        DEBUG: false
    });


    /*
     * ============================================================
     * ALLOWED MEDIA HOSTS
     * ============================================================
     */

    const ALLOWED_MEDIA_HOSTS = new Set([
        'i.redd.it',
        'preview.redd.it',
        'external-preview.redd.it',
        'v.redd.it'
    ]);


    /*
     * ============================================================
     * MEDIA EXTENSIONS
     * ============================================================
     */

    const IMAGE_EXTENSIONS = new Set([
        'jpg',
        'jpeg',
        'png',
        'webp',
        'gif'
    ]);

    const VIDEO_EXTENSIONS = new Set([
        'mp4',
        'webm',
        'mov',
        'm4v'
    ]);


    /*
     * ============================================================
     * DEBUG
     * ============================================================
     */

    function debug(...args) {
        if (CONFIG.DEBUG) {
            console.debug(
                '[Reddit Downloader]',
                ...args
            );
        }
    }


    /*
     * ============================================================
     * URL VALIDATION
     * ============================================================
     */

    function parseURL(value) {
        if (
            typeof value !== 'string' ||
            !value ||
            value.length > 4096
        ) {
            return null;
        }

        try {
            const url = new URL(
                value,
                location.href
            );

            if (url.protocol !== 'https:') {
                return null;
            }

            if (url.username || url.password) {
                return null;
            }

            return url;

        } catch {
            return null;
        }
    }


    function isAllowedMediaURL(value) {
        const url = parseURL(value);

        if (!url) {
            return false;
        }

        return ALLOWED_MEDIA_HOSTS.has(
            url.hostname.toLowerCase()
        );
    }


    /*
     * ============================================================
     * EXTENSION
     * ============================================================
     */

    function getExtension(url) {
        const parsed = parseURL(url);

        if (!parsed) {
            return null;
        }

        const pathname =
            parsed.pathname.toLowerCase();

        const match =
            pathname.match(/\.([a-z0-9]{2,5})$/);

        if (!match) {
            return null;
        }

        const extension = match[1];

        if (
            IMAGE_EXTENSIONS.has(extension) ||
            VIDEO_EXTENSIONS.has(extension)
        ) {
            return extension === 'jpeg'
                ? 'jpg'
                : extension;
        }

        return null;
    }


    /*
     * ============================================================
     * MEDIA TYPE
     * ============================================================
     */

    function getMediaType(url) {
        const extension = getExtension(url);

        if (
            extension &&
            IMAGE_EXTENSIONS.has(extension)
        ) {
            return 'image';
        }

        if (
            extension &&
            VIDEO_EXTENSIONS.has(extension)
        ) {
            return 'video';
        }

        if (
            typeof url === 'string' &&
            url.includes('v.redd.it')
        ) {
            return 'video';
        }

        return null;
    }


    /*
     * ============================================================
     * FILENAME SANITIZATION
     * ============================================================
     */

    function sanitizeFilename(value) {
        if (
            typeof value !== 'string' ||
            !value
        ) {
            return 'reddit-media';
        }

        let result = value;

        result = result.replace(
            /[<>:"/\\|?*\x00-\x1F]/g,
            ''
        );

        result = result.replace(
            /[\u0000-\u001F\u007F]/g,
            ''
        );

        result = result.replace(
            /\.\.+/g,
            '.'
        );

        result = result.replace(
            /[/\\]/g,
            ''
        );

        result = result.replace(
            /\s+/g,
            ' '
        );

        result = result.trim();

        result = result.replace(
            /[. ]+$/g,
            ''
        );

        return result.substring(0, 160) ||
            'reddit-media';
    }


    /*
     * ============================================================
     * GET POST ELEMENT
     * ============================================================
     */

    function getPostElement(element) {
        return (
            element.closest('shreddit-post') ||
            element.closest('[data-testid="post-container"]')
        );
    }


    /*
     * ============================================================
     * GET COMMENT ELEMENT
     * ============================================================
     */

    function getCommentElement(element) {
        return (
            element.closest('shreddit-comment') ||
            element.closest('[data-testid="comment"]')
        );
    }


    /*
     * ============================================================
     * GET POST ID
     * ============================================================
     *
     * Examples:
     *
     * t3_p2frxcw
     *      ↓
     * p2frxcw
     *
     * ============================================================
     */

    function getPostID(element) {
        const post = getPostElement(element);

        if (!post) {
            return null;
        }

        const candidates = [
            post.getAttribute('id'),
            post.getAttribute('post-id'),
            post.getAttribute('data-post-id'),
            post.dataset?.postId
        ];

        for (const value of candidates) {
            if (
                typeof value !== 'string' ||
                !value
            ) {
                continue;
            }

            /*
             * t3_p2frxcw
             */
            const t3Match =
                value.match(/^t3_([a-z0-9]+)$/i);

            if (t3Match) {
                return t3Match[1];
            }

            /*
             * p2frxcw
             */
            const normalMatch =
                value.match(/^([a-z0-9]+)$/i);

            if (normalMatch) {
                return normalMatch[1];
            }
        }

        return null;
    }


    /*
     * ============================================================
     * GET COMMENT ID
     * ============================================================
     */

    function getCommentID(element) {
        const comment =
            getCommentElement(element);

        if (!comment) {
            return null;
        }

        const candidates = [
            comment.getAttribute('thingid'),
            comment.getAttribute('comment-id'),
            comment.getAttribute('data-comment-id'),
            comment.dataset?.commentId,
            comment.id
        ];

        for (const value of candidates) {
            if (
                typeof value !== 'string' ||
                !value
            ) {
                continue;
            }

            /*
             * t1_xyz123
             *     ↓
             * xyz123
             */

            const t1Match =
                value.match(/^t1_([a-z0-9]+)$/i);

            if (t1Match) {
                return t1Match[1];
            }

            /*
             * Normal ID
             */

            const normalMatch =
                value.match(/^([a-z0-9]+)$/i);

            if (normalMatch) {
                return normalMatch[1];
            }
        }

        return null;
    }


    /*
     * ============================================================
     * FIND ACTUAL POST MEDIA
     * ============================================================
     *
     * IMPORTANT:
     *
     * We intentionally DO NOT scan every image inside the post.
     *
     * This prevents:
     *
     * - avatars
     * - subreddit icons
     * - user icons
     * - badges
     * - UI images
     * - awards
     * - emojis
     *
     * from being downloaded.
     *
     * ============================================================
     */

    function getPostMedia(element) {
        const post =
            getPostElement(element);

        if (!post) {
            return [];
        }

        const media = new Set();


        /*
         * --------------------------------------------------------
         * Reddit image containers
         * --------------------------------------------------------
         */

        const imageSelectors = [
            'a[href*="i.redd.it"]',
            'a[href*="preview.redd.it"]',
            'a[href*="external-preview.redd.it"]'
        ];


        for (
            const selector
            of imageSelectors
        ) {

            post
                .querySelectorAll(selector)
                .forEach(anchor => {

                    const href =
                        anchor.getAttribute('href');

                    if (
                        href &&
                        isAllowedMediaURL(href)
                    ) {
                        const type =
                            getMediaType(href);

                        if (type === 'image') {
                            media.add(href);
                        }
                    }
                });
        }


        /*
         * --------------------------------------------------------
         * Actual <video> elements
         * --------------------------------------------------------
         */

        post
            .querySelectorAll('video')
            .forEach(video => {

                const candidates = [
                    video.currentSrc,
                    video.src
                ];

                video
                    .querySelectorAll('source')
                    .forEach(source => {
                        candidates.push(
                            source.src
                        );
                    });


                for (
                    const url
                    of candidates
                ) {

                    if (
                        isAllowedMediaURL(url)
                    ) {

                        if (
                            getMediaType(url) ===
                            'video'
                        ) {
                            media.add(url);
                        }
                    }
                }
            });


        /*
         * --------------------------------------------------------
         * Reddit video links
         * --------------------------------------------------------
         */

        post
            .querySelectorAll(
                'a[href*="v.redd.it"]'
            )
            .forEach(anchor => {

                const href =
                    anchor.getAttribute('href');

                if (
                    href &&
                    isAllowedMediaURL(href)
                ) {

                    if (
                        getMediaType(href) ===
                        'video'
                    ) {
                        media.add(href);
                    }
                }
            });


        /*
         * --------------------------------------------------------
         * Remove invalid values
         * --------------------------------------------------------
         */

        return [...media].filter(
            url =>
                isAllowedMediaURL(url)
        );
    }


    /*
     * ============================================================
     * FIND COMMENT MEDIA
     * ============================================================
     */

    function getCommentMedia(element) {
        const comment =
            getCommentElement(element);

        if (!comment) {
            return [];
        }

        const media = new Set();


        /*
         * Only explicitly linked Reddit media.
         *
         * Do NOT scan all <img> elements.
         */

        comment
            .querySelectorAll(
                'a[href*="i.redd.it"], ' +
                'a[href*="preview.redd.it"], ' +
                'a[href*="external-preview.redd.it"], ' +
                'a[href*="v.redd.it"]'
            )
            .forEach(anchor => {

                const href =
                    anchor.getAttribute('href');

                if (
                    href &&
                    isAllowedMediaURL(href)
                ) {

                    const type =
                        getMediaType(href);

                    if (
                        type === 'image' ||
                        type === 'video'
                    ) {
                        media.add(href);
                    }
                }
            });


        /*
         * Actual videos inside comments.
         */

        comment
            .querySelectorAll('video')
            .forEach(video => {

                const candidates = [
                    video.currentSrc,
                    video.src
                ];

                video
                    .querySelectorAll('source')
                    .forEach(source => {
                        candidates.push(
                            source.src
                        );
                    });


                for (
                    const url
                    of candidates
                ) {

                    if (
                        isAllowedMediaURL(url)
                    ) {
                        media.add(url);
                    }
                }
            });


        return [...media];
    }


    /*
     * ============================================================
     * GET MEDIA
     * ============================================================
     */

    function getMedia(element) {
        const postMedia =
            getPostMedia(element);

        const commentMedia =
            getCommentMedia(element);

        return [
            ...new Set([
                ...postMedia,
                ...commentMedia
            ])
        ];
    }


    /*
     * ============================================================
     * BUILD FILENAME
     * ============================================================
     */

    function buildFilename(
        element,
        url,
        index
    ) {

        const postID =
            getPostID(element);

        const commentID =
            getCommentID(element);

        /*
         * --------------------------------------------------------
         * Post
         * --------------------------------------------------------
         *
         * p2frxcw.jpg
         *
         * --------------------------------------------------------
         */

        if (postID) {

            let filename =
                sanitizeFilename(
                    postID
                );

            /*
             * Gallery item
             */
            if (index > 0) {
                filename +=
                    `-${index + 1}`;
            }

            const extension =
                getExtension(url) ||
                (
                    getMediaType(url) === 'video'
                        ? 'mp4'
                        : 'jpg'
                );

            return (
                `${CONFIG.DOWNLOAD_FOLDER}/` +
                `${filename}.${extension}`
            );
        }


        /*
         * --------------------------------------------------------
         * Comment
         * --------------------------------------------------------
         *
         * commentID.jpg
         *
         * --------------------------------------------------------
         */

        if (commentID) {

            const filename =
                sanitizeFilename(
                    commentID
                );

            const extension =
                getExtension(url) ||
                (
                    getMediaType(url) === 'video'
                        ? 'mp4'
                        : 'jpg'
                );

            return (
                `${CONFIG.DOWNLOAD_FOLDER}/` +
                `${filename}.${extension}`
            );
        }


        return (
            `${CONFIG.DOWNLOAD_FOLDER}/` +
            `reddit-media-${index + 1}.bin`
        );
    }


    /*
     * ============================================================
     * DOWNLOAD
     * ============================================================
     */

    function download(
        url,
        filename
    ) {

        /*
         * FINAL SECURITY CHECK
         */

        if (
            !isAllowedMediaURL(url)
        ) {
            console.warn(
                '[Reddit Downloader] ' +
                'Blocked untrusted URL:',
                url
            );

            return;
        }


        /*
         * Use GM_download when available.
         */

        if (
            typeof GM_download ===
            'function'
        ) {

            GM_download({
                url,
                name: filename,
                saveAs: false,

                onload() {
                    debug(
                        'Downloaded:',
                        filename
                    );
                },

                onerror(error) {
                    console.error(
                        '[Reddit Downloader] ' +
                        'Download failed:',
                        error
                    );
                }
            });

            return;
        }


        /*
         * Browser fallback.
         */

        const anchor =
            document.createElement('a');

        anchor.href = url;

        anchor.download = filename;

        anchor.target = '_blank';

        anchor.rel =
            'noopener noreferrer';


        document.body.appendChild(anchor);

        anchor.click();

        anchor.remove();
    }


    /*
     * ============================================================
     * BUTTON
     * ============================================================
     */

    function createButton(element) {

        if (
            element.dataset
                .redditDownloaderProcessed ===
            '1'
        ) {
            return;
        }


        /*
         * Check media first.
         */

        const media =
            getMedia(element);


        if (!media.length) {
            return;
        }


        /*
         * Mark only after actual media
         * was found.
         */

        element.dataset
            .redditDownloaderProcessed =
            '1';


        /*
         * Prevent duplicate button.
         */

        if (
            element.querySelector(
                '.reddit-media-download-button'
            )
        ) {
            return;
        }


        const button =
            document.createElement('button');


        button.type = 'button';

        button.className =
            'reddit-media-download-button';

        button.textContent =
            CONFIG.BUTTON_TEXT;


        button.title =
            'Download Reddit media';


        button.style.cssText = `
            appearance: none;
            border: 0;
            background: transparent;
            color: inherit;
            font: inherit;
            font-size: 12px;
            font-weight: 600;
            padding: 7px 9px;
            margin: 0 3px;
            border-radius: 999px;
            cursor: pointer;
            white-space: nowrap;
            opacity: .85;
        `;


        button.addEventListener(
            'mouseenter',
            () => {
                button.style.background =
                    'rgba(128,128,128,.15)';
                button.style.opacity = '1';
            }
        );


        button.addEventListener(
            'mouseleave',
            () => {
                button.style.background =
                    'transparent';
                button.style.opacity = '.85';
            }
        );


        /*
         * --------------------------------------------------------
         * CLICK
         * --------------------------------------------------------
         */

        button.addEventListener(
            'click',
            async event => {

                event.preventDefault();

                event.stopPropagation();


                button.disabled = true;

                const original =
                    button.textContent;

                button.textContent =
                    'Downloading...';


                try {

                    /*
                     * Scan again at click time.
                     */

                    const currentMedia =
                        getMedia(element);


                    /*
                     * IMPORTANT:
                     *
                     * Deduplicate URLs before
                     * downloading.
                     */

                    const uniqueMedia =
                        [
                            ...new Set(
                                currentMedia
                            )
                        ];


                    if (
                        !uniqueMedia.length
                    ) {

                        button.textContent =
                            'No media';

                        return;
                    }


                    /*
                     * Download each unique
                     * media URL exactly once.
                     */

                    for (
                        let i = 0;
                        i < uniqueMedia.length;
                        i++
                    ) {

                        const url =
                            uniqueMedia[i];


                        if (
                            !isAllowedMediaURL(
                                url
                            )
                        ) {
                            continue;
                        }


                        const filename =
                            buildFilename(
                                element,
                                url,
                                i
                            );


                        download(
                            url,
                            filename
                        );


                        /*
                         * Prevent browser
                         * download throttling.
                         */

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    200
                                )
                        );
                    }


                    button.textContent =
                        'Downloaded';

                } catch (error) {

                    console.error(
                        '[Reddit Downloader]',
                        error
                    );

                    button.textContent =
                        'Error';

                } finally {

                    setTimeout(
                        () => {

                            button.disabled =
                                false;

                            button.textContent =
                                original;

                        },
                        1500
                    );
                }
            }
        );


        /*
         * --------------------------------------------------------
         * PLACE BUTTON
         * --------------------------------------------------------
         */

        insertButton(
            element,
            button
        );
    }


    /*
     * ============================================================
     * BUTTON PLACEMENT
     * ============================================================
     */

    function insertButton(
        element,
        button
    ) {

        /*
         * Reddit vote controls.
         */

        const voteSelectors = [
            '[data-testid="vote-arrows"]',
            '[slot="vote-buttons"]'
        ];


        for (
            const selector
            of voteSelectors
        ) {

            const vote =
                element.querySelector(
                    selector
                );


            if (
                vote &&
                vote.parentElement
            ) {

                vote.parentElement
                    .insertBefore(
                        button,
                        vote
                    );

                return;
            }
        }


        /*
         * Upvote button.
         */

        const upvote =
            element.querySelector(
                'button[aria-label*="upvote" i]'
            );


        if (
            upvote &&
            upvote.parentElement
        ) {

            upvote.parentElement
                .insertBefore(
                    button,
                    upvote
                );

            return;
        }


        /*
         * Old Reddit.
         */

        const oldButtons =
            element.querySelector(
                '.buttons'
            );


        if (oldButtons) {

            oldButtons.insertBefore(
                button,
                oldButtons.firstChild
            );
        }
    }


    /*
     * ============================================================
     * SCAN
     * ============================================================
     */

    function scan() {

        /*
         * Only scan actual Reddit posts.
         *
         * IMPORTANT:
         *
         * No generic <article> selector.
         */

        document
            .querySelectorAll(
                'shreddit-post, ' +
                '[data-testid="post-container"]'
            )
            .forEach(
                createButton
            );


        /*
         * Comments.
         */

        document
            .querySelectorAll(
                'shreddit-comment, ' +
                '[data-testid="comment"]'
            )
            .forEach(
                createButton
            );
    }


    /*
     * ============================================================
     * MUTATION OBSERVER
     * ============================================================
     */

    let scanTimer = null;


    const observer =
        new MutationObserver(
            mutations => {

                let added = false;


                for (
                    const mutation
                    of mutations
                ) {

                    if (
                        mutation.addedNodes &&
                        mutation.addedNodes.length
                    ) {

                        added = true;

                        break;
                    }
                }


                if (!added) {
                    return;
                }


                clearTimeout(
                    scanTimer
                );


                scanTimer =
                    setTimeout(
                        scan,
                        300
                    );
            }
        );


    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );


    /*
     * ============================================================
     * SPA NAVIGATION
     * ============================================================
     */

    let lastURL =
        location.href;


    setInterval(
        () => {

            if (
                location.href !==
                lastURL
            ) {

                lastURL =
                    location.href;


                setTimeout(
                    scan,
                    500
                );

                setTimeout(
                    scan,
                    1500
                );

                setTimeout(
                    scan,
                    3000
                );
            }

        },
        1000
    );


    /*
     * ============================================================
     * INITIAL SCAN
     * ============================================================
     */

    setTimeout(
        scan,
        500
    );

    setTimeout(
        scan,
        1500
    );

    setTimeout(
        scan,
        3000
    );


    debug(
        'Reddit Media Downloader 2.1.0 loaded.'
    );

})();
