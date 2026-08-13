// ==UserScript==
// @name         Reddit Media Downloader - Zero Trust
// @namespace    reddit-media-downloader
// @version      2.2.0
// @description  Securely download Reddit post and comment media.
// @author       mrkwxopya
// @license      MIT
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @run-at       document-idle
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
     * Reddit Media Downloader
     * Version 2.2.0
     * Author: mrkwxopya
     * License: MIT
     * ============================================================
     */

    const CONFIG = Object.freeze({
        DOWNLOAD_FOLDER: 'reddit-posts',
        BUTTON_TEXT: 'Download',
        DEBUG: false
    });


    /*
     * ============================================================
     * Allowed Reddit media hosts
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
     * Supported extensions
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
     * Debug
     * ============================================================
     */

    function debug(...args) {

        if (!CONFIG.DEBUG) {
            return;
        }

        console.debug(
            '[Reddit Downloader]',
            ...args
        );
    }


    /*
     * ============================================================
     * URL validation
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

            const url =
                new URL(
                    value,
                    location.href
                );


            /*
             * HTTPS only.
             */

            if (
                url.protocol !== 'https:'
            ) {
                return null;
            }


            /*
             * Do not allow credentials.
             */

            if (
                url.username ||
                url.password
            ) {
                return null;
            }


            return url;

        } catch {

            return null;
        }
    }


    function isAllowedMediaURL(value) {

        const url =
            parseURL(value);


        if (!url) {
            return false;
        }


        return ALLOWED_MEDIA_HOSTS.has(
            url.hostname.toLowerCase()
        );
    }


    /*
     * ============================================================
     * Extension
     * ============================================================
     */

    function getExtension(url) {

        const parsed =
            parseURL(url);


        if (!parsed) {
            return null;
        }


        const pathname =
            parsed.pathname.toLowerCase();


        const match =
            pathname.match(
                /\.([a-z0-9]{2,5})$/
            );


        if (!match) {
            return null;
        }


        let extension =
            match[1];


        if (
            extension === 'jpeg'
        ) {
            extension = 'jpg';
        }


        if (
            IMAGE_EXTENSIONS.has(
                extension
            ) ||
            VIDEO_EXTENSIONS.has(
                extension
            )
        ) {
            return extension;
        }


        return null;
    }


    /*
     * ============================================================
     * Media type
     * ============================================================
     */

    function getMediaType(url) {

        const extension =
            getExtension(url);


        if (
            extension &&
            IMAGE_EXTENSIONS.has(
                extension
            )
        ) {
            return 'image';
        }


        if (
            extension &&
            VIDEO_EXTENSIONS.has(
                extension
            )
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
     * Filename sanitization
     * ============================================================
     */

    function sanitizeFilename(value) {

        if (
            typeof value !== 'string' ||
            !value
        ) {
            return 'reddit-media';
        }


        let result =
            String(value);


        result =
            result.replace(
                /[<>:"/\\|?*\x00-\x1F]/g,
                ''
            );


        result =
            result.replace(
                /[\u0000-\u001F\u007F]/g,
                ''
            );


        /*
         * Prevent path traversal.
         */

        result =
            result.replace(
                /\.\.+/g,
                '.'
            );


        result =
            result.replace(
                /[/\\]/g,
                ''
            );


        result =
            result.replace(
                /\s+/g,
                ' '
            );


        result =
            result.trim();


        result =
            result.replace(
                /[. ]+$/g,
                ''
            );


        if (!result) {
            result =
                'reddit-media';
        }


        return result.substring(
            0,
            160
        );
    }


    /*
     * ============================================================
     * Post element
     * ============================================================
     */

    function getPostElement(element) {

        return (
            element.closest(
                'shreddit-post'
            ) ||
            element.closest(
                '[data-testid="post-container"]'
            )
        );
    }


    /*
     * ============================================================
     * Comment element
     * ============================================================
     */

    function getCommentElement(element) {

        return (
            element.closest(
                'shreddit-comment'
            ) ||
            element.closest(
                '[data-testid="comment"]'
            )
        );
    }


    /*
     * ============================================================
     * Post ID
     * ============================================================
     */

    function getPostID(element) {

        const post =
            getPostElement(element);


        if (!post) {
            return null;
        }


        const candidates = [
            post.getAttribute('id'),
            post.getAttribute('post-id'),
            post.getAttribute('data-post-id'),
            post.dataset?.postId
        ];


        for (
            const value
            of candidates
        ) {

            if (
                typeof value !== 'string' ||
                !value
            ) {
                continue;
            }


            /*
             * t3_p2frxcw
             *      ↓
             * p2frxcw
             */

            const t3 =
                value.match(
                    /^t3_([a-z0-9]+)$/i
                );


            if (t3) {
                return t3[1];
            }


            /*
             * p2frxcw
             */

            if (
                /^[a-z0-9]+$/i.test(value)
            ) {
                return value;
            }
        }


        return null;
    }


    /*
     * ============================================================
     * Comment ID
     * ============================================================
     */

    function getCommentID(element) {

        const comment =
            getCommentElement(element);


        if (!comment) {
            return null;
        }


        const candidates = [
            comment.getAttribute(
                'thingid'
            ),
            comment.getAttribute(
                'comment-id'
            ),
            comment.getAttribute(
                'data-comment-id'
            ),
            comment.dataset?.commentId,
            comment.id
        ];


        for (
            const value
            of candidates
        ) {

            if (
                typeof value !== 'string' ||
                !value
            ) {
                continue;
            }


            /*
             * t1_xyz789
             *      ↓
             * xyz789
             */

            const t1 =
                value.match(
                    /^t1_([a-z0-9]+)$/i
                );


            if (t1) {
                return t1[1];
            }


            if (
                /^[a-z0-9]+$/i.test(value)
            ) {
                return value;
            }
        }


        return null;
    }


    /*
     * ============================================================
     * POST MEDIA
     * ============================================================
     *
     * IMPORTANT:
     *
     * We intentionally do NOT scan every image.
     *
     * Reddit UI images, avatars, icons, awards, etc.
     * are ignored.
     *
     * ============================================================
     */

    function getPostMedia(element) {

        const post =
            getPostElement(element);


        if (!post) {
            return [];
        }


        const media =
            new Set();


        /*
         * Reddit image links.
         */

        post
            .querySelectorAll(
                'a[href]'
            )
            .forEach(anchor => {

                const href =
                    anchor.getAttribute(
                        'href'
                    );


                if (
                    !href ||
                    !isAllowedMediaURL(href)
                ) {
                    return;
                }


                const type =
                    getMediaType(href);


                if (
                    type === 'image' ||
                    type === 'video'
                ) {
                    media.add(href);
                }
            });


        /*
         * Actual video elements.
         */

        post
            .querySelectorAll(
                'video'
            )
            .forEach(video => {

                const sources = [
                    video.currentSrc,
                    video.src
                ];


                video
                    .querySelectorAll(
                        'source'
                    )
                    .forEach(source => {

                        if (
                            source.src
                        ) {
                            sources.push(
                                source.src
                            );
                        }
                    });


                sources.forEach(url => {

                    if (
                        isAllowedMediaURL(
                            url
                        )
                    ) {

                        if (
                            getMediaType(
                                url
                            ) === 'video'
                        ) {
                            media.add(url);
                        }
                    }
                });
            });


        return [
            ...media
        ];
    }


    /*
     * ============================================================
     * COMMENT MEDIA
     * ============================================================
     */

    function getCommentMedia(element) {

        const comment =
            getCommentElement(element);


        if (!comment) {
            return [];
        }


        const media =
            new Set();


        /*
         * Only explicit Reddit media links.
         */

        comment
            .querySelectorAll(
                'a[href]'
            )
            .forEach(anchor => {

                const href =
                    anchor.getAttribute(
                        'href'
                    );


                if (
                    !href ||
                    !isAllowedMediaURL(href)
                ) {
                    return;
                }


                const type =
                    getMediaType(href);


                if (
                    type === 'image' ||
                    type === 'video'
                ) {
                    media.add(href);
                }
            });


        /*
         * Actual videos.
         */

        comment
            .querySelectorAll(
                'video'
            )
            .forEach(video => {

                const sources = [
                    video.currentSrc,
                    video.src
                ];


                video
                    .querySelectorAll(
                        'source'
                    )
                    .forEach(source => {

                        if (
                            source.src
                        ) {
                            sources.push(
                                source.src
                            );
                        }
                    });


                sources.forEach(url => {

                    if (
                        isAllowedMediaURL(
                            url
                        )
                    ) {
                        media.add(url);
                    }
                });
            });


        return [
            ...media
        ];
    }


    /*
     * ============================================================
     * Get all media
     * ============================================================
     */

    function getMedia(element) {

        const result =
            new Set();


        getPostMedia(
            element
        ).forEach(
            url => result.add(url)
        );


        getCommentMedia(
            element
        ).forEach(
            url => result.add(url)
        );


        return [
            ...result
        ];
    }


    /*
     * ============================================================
     * Build filename
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


        let baseName;


        /*
         * Post:
         *
         * p2frxcw.jpg
         *
         * p2frxcw-2.jpg
         */

        if (postID) {

            baseName =
                sanitizeFilename(
                    postID
                );

        }


        /*
         * Comment:
         *
         * commentid.jpg
         */

        else if (commentID) {

            baseName =
                sanitizeFilename(
                    commentID
                );

        }


        else {

            baseName =
                'reddit-media';
        }


        /*
         * Gallery numbering.
         */

        if (index > 0) {

            baseName +=
                `-${index + 1}`;
        }


        const extension =
            getExtension(url) ||
            (
                getMediaType(url) ===
                'video'
                    ? 'mp4'
                    : 'jpg'
            );


        return (
            `${CONFIG.DOWNLOAD_FOLDER}/` +
            `${baseName}.${extension}`
        );
    }


    /*
     * ============================================================
     * DOWNLOAD
     * ============================================================
     */

    function downloadMedia(
        url,
        filename
    ) {

        /*
         * Final security validation.
         */

        if (
            !isAllowedMediaURL(
                url
            )
        ) {

            console.warn(
                '[Reddit Downloader] ' +
                'Blocked URL:',
                url
            );

            return;
        }


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
            document.createElement(
                'a'
            );


        anchor.href =
            url;


        anchor.download =
            filename;


        anchor.target =
            '_blank';


        anchor.rel =
            'noopener noreferrer';


        document.body.appendChild(
            anchor
        );


        anchor.click();


        anchor.remove();
    }


    /*
     * ============================================================
     * FIND UPVOTE BUTTON
     * ============================================================
     *
     * This is the important part.
     *
     * Instead of guessing the vote container,
     * find Reddit's actual Upvote button.
     *
     * ============================================================
     */

    function findUpvoteButton(
        element
    ) {

        const selectors = [

            /*
             * Current Reddit.
             */

            'button[aria-label="upvote"]',

            'button[aria-label="Upvote"]',

            'button[aria-label*="upvote" i]',

            /*
             * Faceplate / Reddit custom elements.
             */

            'faceplate-tracker[noun="upvote"]',

            '[data-testid="upvote-button"]',

            /*
             * Old Reddit.
             */

            '.arrow.up'
        ];


        for (
            const selector
            of selectors
        ) {

            const button =
                element.querySelector(
                    selector
                );


            if (button) {
                return button;
            }
        }


        return null;
    }


    /*
     * ============================================================
     * CREATE DOWNLOAD BUTTON
     * ============================================================
     */

    function createDownloadButton(
        element
    ) {

        /*
         * Do not create duplicates.
         */

        if (
            element.querySelector(
                '.reddit-media-download-button'
            )
        ) {
            return;
        }


        /*
         * Find the actual Upvote button.
         */

        const upvote =
            findUpvoteButton(
                element
            );


        /*
         * If Reddit has not rendered
         * the voting controls yet,
         * do nothing.
         *
         * MutationObserver will retry.
         */

        if (!upvote) {
            return;
        }


        /*
         * Check media.
         */

        const media =
            getMedia(element);


        if (!media.length) {
            return;
        }


        /*
         * Create button.
         */

        const button =
            document.createElement(
                'button'
            );


        button.type =
            'button';


        button.className =
            'reddit-media-download-button';


        button.textContent =
            CONFIG.BUTTON_TEXT;


        button.setAttribute(
            'aria-label',
            'Download media'
        );


        button.title =
            'Download media';


        /*
         * Make it visually similar
         * to Reddit action buttons.
         */

        button.style.cssText = `
            appearance: none;
            border: 0;
            outline: 0;
            background: transparent;
            color: inherit;
            font-family: inherit;
            font-size: 12px;
            font-weight: 600;
            line-height: 1;
            min-height: 32px;
            padding: 0 10px;
            margin: 0;
            border-radius: 999px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            box-sizing: border-box;
        `;


        /*
         * Hover.
         */

        button.addEventListener(
            'mouseenter',
            () => {

                button.style.background =
                    'rgba(128,128,128,.16)';
            }
        );


        button.addEventListener(
            'mouseleave',
            () => {

                button.style.background =
                    'transparent';
            }
        );


        /*
         * ========================================================
         * CLICK
         * ========================================================
         */

        button.addEventListener(
            'click',
            async event => {

                event.preventDefault();

                event.stopPropagation();


                const originalText =
                    button.textContent;


                button.disabled =
                    true;


                button.textContent =
                    'Downloading...';


                try {

                    /*
                     * Get media again.
                     */

                    const currentMedia =
                        [
                            ...new Set(
                                getMedia(
                                    element
                                )
                            )
                        ];


                    if (
                        !currentMedia.length
                    ) {

                        button.textContent =
                            'No media';

                        return;
                    }


                    /*
                     * Download each unique URL
                     * exactly once.
                     */

                    for (
                        let i = 0;
                        i < currentMedia.length;
                        i++
                    ) {

                        const url =
                            currentMedia[i];


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


                        downloadMedia(
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
                                originalText;

                        },
                        1500
                    );
                }
            }
        );


        /*
         * ========================================================
         * INSERT DIRECTLY BEFORE UPVOTE
         * ========================================================
         *
         * This is deliberately:
         *
         * parent.insertBefore(
         *     download,
         *     upvote
         * );
         *
         * So the resulting order is:
         *
         * Download | Upvote | Score | Downvote
         *
         * ========================================================
         */

        const parent =
            upvote.parentElement;


        if (!parent) {
            return;
        }


        parent.insertBefore(
            button,
            upvote
        );
    }


    /*
     * ============================================================
     * SCAN
     * ============================================================
     */

    function scan() {

        /*
         * Posts.
         */

        document
            .querySelectorAll(
                'shreddit-post, ' +
                '[data-testid="post-container"]'
            )
            .forEach(
                createDownloadButton
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
                createDownloadButton
            );
    }


    /*
     * ============================================================
     * MUTATION OBSERVER
     * ============================================================
     */

    let scanTimer =
        null;


    const observer =
        new MutationObserver(
            mutations => {

                let changed =
                    false;


                for (
                    const mutation
                    of mutations
                ) {

                    if (
                        mutation.addedNodes &&
                        mutation.addedNodes.length
                    ) {

                        changed =
                            true;

                        break;
                    }
                }


                if (!changed) {
                    return;
                }


                clearTimeout(
                    scanTimer
                );


                scanTimer =
                    setTimeout(
                        scan,
                        250
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
                    300
                );


                setTimeout(
                    scan,
                    1000
                );


                setTimeout(
                    scan,
                    2500
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
        'Reddit Media Downloader 2.2.0 loaded.'
    );

})();
