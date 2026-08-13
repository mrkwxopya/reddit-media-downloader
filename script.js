// ==UserScript==
// @name         Reddit Media Downloader - Zero Trust
// @namespace    reddit-media-downloader
// @version      2.5.0
// @description  Securely download Reddit post and comment media.
// @author       mrkwxopya
// @license      MIT
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @match        https://sh.reddit.com/*
// @run-at       document-idle
// @grant        GM_download
// @connect      i.redd.it
// @connect      preview.redd.it
// @connect      external-preview.redd.it
// @connect      v.redd.it
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    /*
     * ============================================================
     * Reddit Media Downloader
     * Version 2.5.0
     * Author: mrkwxopya
     * License: MIT
     * ============================================================
     */

    const CONFIG = Object.freeze({
        DOWNLOAD_FOLDER: 'reddit-posts',
        BUTTON_TEXT: 'Download',
        SCAN_INTERVAL: 1200,
        DEBUG: false
    });


    /*
     * ============================================================
     * TRUSTED MEDIA HOSTS
     * ============================================================
     *
     * Zero Trust:
     *
     * Nothing is downloaded unless the hostname is explicitly
     * present in this allowlist.
     *
     * ============================================================
     */

    const ALLOWED_MEDIA_HOSTS = new Set([
        'i.redd.it',
        'preview.redd.it',
        'external-preview.redd.it',
        'v.redd.it'
    ]);


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
     * URL PARSING
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
             * Never allow credentials.
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


    /*
     * ============================================================
     * ZERO TRUST MEDIA VALIDATION
     * ============================================================
     */

    function isAllowedMediaURL(
        value
    ) {

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
     * EXTENSION
     * ============================================================
     */

    function getExtension(
        value
    ) {

        const url =
            parseURL(value);


        if (!url) {
            return null;
        }


        const match =
            url.pathname
                .toLowerCase()
                .match(
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
     * MEDIA TYPE
     * ============================================================
     */

    function getMediaType(
        value
    ) {

        const extension =
            getExtension(value);


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
            typeof value === 'string' &&
            value.includes(
                'v.redd.it'
            )
        ) {
            return 'video';
        }


        return null;
    }


    /*
     * ============================================================
     * SANITIZE FILENAME
     * ============================================================
     */

    function sanitizeFilename(
        value
    ) {

        if (
            typeof value !== 'string' ||
            !value
        ) {
            return 'reddit-media';
        }


        let result =
            String(value);


        /*
         * Remove illegal Windows filename
         * characters.
         */

        result =
            result.replace(
                /[<>:"/\\|?*\x00-\x1F]/g,
                ''
            );


        /*
         * Remove control characters.
         */

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
     * SHADOW ROOT HELPERS
     * ============================================================
     */

    function getShadowRoot(
        element
    ) {

        if (!element) {
            return null;
        }


        return element.shadowRoot || null;
    }


    /*
     * ============================================================
     * DEEP QUERY
     * ============================================================
     */

    function queryDeep(
        root,
        selectors
    ) {

        if (!root) {
            return null;
        }


        /*
         * Search the current root first.
         */

        for (
            const selector
            of selectors
        ) {

            try {

                const element =
                    root.querySelector(
                        selector
                    );


                if (element) {
                    return element;
                }

            } catch {
                /*
                 * Ignore invalid selector errors.
                 */
            }
        }


        /*
         * Search nested open Shadow DOM.
         */

        if (
            !root.querySelectorAll
        ) {
            return null;
        }


        const elements =
            root.querySelectorAll('*');


        for (
            const element
            of elements
        ) {

            if (
                !element.shadowRoot
            ) {
                continue;
            }


            const result =
                queryDeep(
                    element.shadowRoot,
                    selectors
                );


            if (result) {
                return result;
            }
        }


        return null;
    }


    /*
     * ============================================================
     * DEEP QUERY ALL
     * ============================================================
     */

    function queryAllDeep(
        root,
        selector
    ) {

        const results = [];


        if (!root) {
            return results;
        }


        if (
            root.querySelectorAll
        ) {

            root
                .querySelectorAll(
                    selector
                )
                .forEach(
                    element => {

                        if (
                            !results.includes(
                                element
                            )
                        ) {
                            results.push(
                                element
                            );
                        }
                    }
                );
        }


        if (
            !root.querySelectorAll
        ) {
            return results;
        }


        const elements =
            root.querySelectorAll('*');


        for (
            const element
            of elements
        ) {

            if (
                !element.shadowRoot
            ) {
                continue;
            }


            const nested =
                queryAllDeep(
                    element.shadowRoot,
                    selector
                );


            for (
                const item
                of nested
            ) {

                if (
                    !results.includes(
                        item
                    )
                ) {
                    results.push(
                        item
                    );
                }
            }
        }


        return results;
    }


    /*
     * ============================================================
     * POST ID
     * ============================================================
     */

    function getPostID(
        post
    ) {

        if (!post) {
            return null;
        }


        const attributes = [
            'id',
            'post-id',
            'data-post-id'
        ];


        for (
            const attribute
            of attributes
        ) {

            const value =
                post.getAttribute(
                    attribute
                );


            if (
                !value
            ) {
                continue;
            }


            const t3 =
                value.match(
                    /^t3_([a-z0-9]+)$/i
                );


            if (t3) {
                return t3[1];
            }


            /*
             * Ignore generic element IDs
             * such as shreddit-post-xxx.
             */

            if (
                /^[a-z0-9]+$/i.test(
                    value
                )
            ) {
                return value;
            }
        }


        /*
         * Try the Reddit post URL.
         */

        const links =
            queryAllDeep(
                post,
                'a[href*="/comments/"]'
            );


        for (
            const link
            of links
        ) {

            const href =
                link.getAttribute(
                    'href'
                );


            if (!href) {
                continue;
            }


            const match =
                href.match(
                    /\/comments\/([a-z0-9]+)/i
                );


            if (match) {
                return match[1];
            }
        }


        return null;
    }


    /*
     * ============================================================
     * COMMENT ID
     * ============================================================
     */

    function getCommentID(
        comment
    ) {

        if (!comment) {
            return null;
        }


        const attributes = [
            'thingid',
            'comment-id',
            'data-comment-id',
            'id'
        ];


        for (
            const attribute
            of attributes
        ) {

            const value =
                comment.getAttribute(
                    attribute
                );


            if (!value) {
                continue;
            }


            const t1 =
                value.match(
                    /^t1_([a-z0-9]+)$/i
                );


            if (t1) {
                return t1[1];
            }


            /*
             * Reddit comment IDs normally
             * contain alphanumeric characters.
             */

            if (
                /^[a-z0-9]+$/i.test(
                    value
                )
            ) {
                return value;
            }
        }


        return null;
    }


    /*
     * ============================================================
     * GET MEDIA FROM OWNER
     * ============================================================
     */

    function collectMedia(
        owner
    ) {

        const media =
            new Set();


        if (!owner) {
            return [];
        }


        /*
         * --------------------------------------------------------
         * Explicit Reddit media links
         * --------------------------------------------------------
         *
         * We DO NOT scan every image.
         *
         * This prevents:
         *
         * - avatars
         * - profile pictures
         * - Reddit icons
         * - awards
         * - UI images
         *
         * from being downloaded.
         */

        queryAllDeep(
            owner,
            'a[href]'
        ).forEach(
            anchor => {

                const href =
                    anchor.getAttribute(
                        'href'
                    );


                if (
                    !href
                ) {
                    return;
                }


                if (
                    !isAllowedMediaURL(
                        href
                    )
                ) {
                    return;
                }


                const type =
                    getMediaType(
                        href
                    );


                if (
                    type === 'image' ||
                    type === 'video'
                ) {
                    media.add(
                        href
                    );
                }
            }
        );


        /*
         * --------------------------------------------------------
         * Video elements
         * --------------------------------------------------------
         */

        queryAllDeep(
            owner,
            'video'
        ).forEach(
            video => {

                const sources = [
                    video.currentSrc,
                    video.src
                ];


                queryAllDeep(
                    video,
                    'source'
                ).forEach(
                    source => {

                        if (
                            source.src
                        ) {
                            sources.push(
                                source.src
                            );
                        }
                    }
                );


                sources.forEach(
                    url => {

                        if (
                            isAllowedMediaURL(
                                url
                            )
                        ) {
                            media.add(
                                url
                            );
                        }
                    }
                );
            }
        );


        return [
            ...media
        ];
    }


    /*
     * ============================================================
     * FIND POST OWNER
     * ============================================================
     */

    function findPostOwner(
        element
    ) {

        if (!element) {
            return null;
        }


        const post =
            element.closest?.(
                'shreddit-post'
            );


        if (post) {
            return post;
        }


        return null;
    }


    /*
     * ============================================================
     * FIND COMMENT OWNER
     * ============================================================
     */

    function findCommentOwner(
        element
    ) {

        if (!element) {
            return null;
        }


        const comment =
            element.closest?.(
                'shreddit-comment'
            );


        if (comment) {
            return comment;
        }


        return null;
    }


    /*
     * ============================================================
     * FIND UPVOTE
     * ============================================================
     *
     * IMPORTANT:
     *
     * Current Reddit / shReddit uses:
     *
     * <button upvote>
     *
     * inside the component Shadow DOM.
     *
     * ============================================================
     */

    function findUpvote(
        owner
    ) {

        if (!owner) {
            return null;
        }


        const shadow =
            getShadowRoot(
                owner
            );


        /*
         * For shReddit posts/comments,
         * this is the preferred selector.
         */

        if (shadow) {

            const direct =
                shadow.querySelector(
                    'button[upvote]'
                );


            if (direct) {
                return direct;
            }


            /*
             * Additional selectors.
             */

            const selectors = [
                'button[aria-label="Upvote"]',
                'button[aria-label="upvote"]',
                'button[aria-label*="upvote" i]',
                '[data-testid="upvote-button"]',
                '[data-event-action="upvote"]',
                '[slot="vote-button"]'
            ];


            for (
                const selector
                of selectors
            ) {

                const element =
                    shadow.querySelector(
                        selector
                    );


                if (element) {
                    return element;
                }
            }
        }


        /*
         * Fallback to deep search.
         */

        return queryDeep(
            owner,
            [
                'button[upvote]',
                'button[aria-label="Upvote"]',
                'button[aria-label="upvote"]',
                'button[aria-label*="upvote" i]',
                '[data-testid="upvote-button"]',
                '[data-event-action="upvote"]',
                '[slot="vote-button"]'
            ]
        );
    }


    /*
     * ============================================================
     * FIND VOTE CONTAINER
     * ============================================================
     */

    function findVoteContainer(
        upvote
    ) {

        if (!upvote) {
            return null;
        }


        /*
         * In current shReddit the immediate
         * parent of button[upvote] is the
         * correct action container.
         */

        if (
            upvote.parentElement
        ) {
            return upvote.parentElement;
        }


        return null;
    }


    /*
     * ============================================================
     * BUILD FILENAME
     * ============================================================
     *
     * Example:
     *
     * p2frxcw.jpg
     *
     * p2frxcw-2.jpg
     *
     * p2frxcw-3.jpg
     *
     * ============================================================
     */

    function buildFilename(
        owner,
        url,
        index
    ) {

        let baseName =
            null;


        /*
         * Post.
         */

        if (
            owner.matches?.(
                'shreddit-post'
            )
        ) {

            baseName =
                getPostID(
                    owner
                );
        }


        /*
         * Comment.
         */

        else if (
            owner.matches?.(
                'shreddit-comment'
            )
        ) {

            baseName =
                getCommentID(
                    owner
                );
        }


        /*
         * Fallback.
         */

        if (
            !baseName
        ) {

            baseName =
                'reddit-media';
        }


        baseName =
            sanitizeFilename(
                baseName
            );


        /*
         * Gallery numbering.
         */

        if (
            index > 0
        ) {

            baseName +=
                `-${index + 1}`;
        }


        /*
         * Determine extension.
         */

        let extension =
            getExtension(
                url
            );


        if (
            !extension
        ) {

            extension =
                getMediaType(
                    url
                ) === 'video'
                    ? 'mp4'
                    : 'jpg';
        }


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
         * FINAL SECURITY CHECK
         */

        if (
            !isAllowedMediaURL(
                url
            )
        ) {

            console.warn(
                '[Reddit Downloader] ' +
                'Blocked untrusted URL:',
                url
            );

            return;
        }


        /*
         * Filename security check.
         *
         * The path is generated internally.
         */

        if (
            typeof filename !== 'string' ||
            !filename.startsWith(
                `${CONFIG.DOWNLOAD_FOLDER}/`
            )
        ) {

            console.warn(
                '[Reddit Downloader] ' +
                'Blocked unsafe filename:',
                filename
            );

            return;
        }


        /*
         * Tampermonkey / Violentmonkey.
         */

        if (
            typeof GM_download ===
            'function'
        ) {

            GM_download({

                url: url,

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
     * CREATE DOWNLOAD BUTTON
     * ============================================================
     */

    function createDownloadButton(
        owner
    ) {

        if (!owner) {
            return;
        }


        /*
         * --------------------------------------------------------
         * Do not create duplicate buttons.
         * --------------------------------------------------------
         */

        const shadow =
            getShadowRoot(
                owner
            );


        if (
            shadow &&
            shadow.querySelector(
                '.reddit-media-download-button'
            )
        ) {
            return;
        }


        if (
            owner.querySelector?.(
                '.reddit-media-download-button'
            )
        ) {
            return;
        }


        /*
         * --------------------------------------------------------
         * Find media.
         * --------------------------------------------------------
         */

        const media =
            collectMedia(
                owner
            );


        if (
            !media.length
        ) {
            return;
        }


        /*
         * --------------------------------------------------------
         * Find Reddit Upvote.
         * --------------------------------------------------------
         */

        const upvote =
            findUpvote(
                owner
            );


        if (
            !upvote
        ) {

            debug(
                'Media found, waiting for Upvote:',
                owner
            );

            return;
        }


        /*
         * --------------------------------------------------------
         * Find action container.
         * --------------------------------------------------------
         */

        const container =
            findVoteContainer(
                upvote
            );


        if (
            !container
        ) {
            return;
        }


        /*
         * --------------------------------------------------------
         * Create button.
         * --------------------------------------------------------
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


        button.setAttribute(
            'title',
            'Download media'
        );


        /*
         * Reddit-like styling.
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
            height: 32px;
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
            flex: 0 0 auto;
        `;


        /*
         * Hover.
         */

        button.addEventListener(
            'mouseenter',
            () => {

                if (
                    !button.disabled
                ) {

                    button.style.background =
                        'rgba(128,128,128,.16)';
                }
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
         * --------------------------------------------------------
         * DOWNLOAD CLICK
         * --------------------------------------------------------
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
                     * Re-scan immediately.
                     */

                    const currentMedia =
                        [
                            ...new Set(
                                collectMedia(
                                    owner
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
                     * Download each unique URL.
                     */

                    for (
                        let i = 0;
                        i < currentMedia.length;
                        i++
                    ) {

                        const url =
                            currentMedia[i];


                        /*
                         * Zero Trust validation.
                         */

                        if (
                            !isAllowedMediaURL(
                                url
                            )
                        ) {
                            continue;
                        }


                        const filename =
                            buildFilename(
                                owner,
                                url,
                                i
                            );


                        downloadMedia(
                            url,
                            filename
                        );


                        /*
                         * Small delay to avoid
                         * browser download throttling.
                         */

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    250
                                )
                        );
                    }


                    button.textContent =
                        'Downloaded';


                } catch (
                    error
                ) {

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
         * INSERT BEFORE UPVOTE
         * ========================================================
         *
         * IMPORTANT:
         *
         * The button is inserted into the same
         * container as the actual Reddit Upvote.
         *
         * Result:
         *
         * Download | Upvote | Score | Downvote
         *
         * ========================================================
         */

        container.insertBefore(
            button,
            upvote
        );


        debug(
            'Download button inserted:',
            owner
        );
    }


    /*
     * ============================================================
     * SCAN POSTS
     * ============================================================
     */

    function scanPosts() {

        /*
         * Current shReddit.
         */

        document
            .querySelectorAll(
                'shreddit-post'
            )
            .forEach(
                post => {

                    createDownloadButton(
                        post
                    );
                }
            );


        /*
         * Fallback.
         */

        document
            .querySelectorAll(
                '[data-testid="post-container"]'
            )
            .forEach(
                post => {

                    createDownloadButton(
                        post
                    );
                }
            );
    }


    /*
     * ============================================================
     * SCAN COMMENTS
     * ============================================================
     */

    function scanComments() {

        /*
         * Standard comment.
         */

        document
            .querySelectorAll(
                'shreddit-comment'
            )
            .forEach(
                comment => {

                    createDownloadButton(
                        comment
                    );
                }
            );


        /*
         * Some Reddit versions expose
         * the action row separately.
         *
         * Find its parent comment.
         */

        document
            .querySelectorAll(
                'shreddit-comment-action-row'
            )
            .forEach(
                actionRow => {

                    const comment =
                        actionRow.closest(
                            'shreddit-comment'
                        );


                    if (
                        comment
                    ) {

                        createDownloadButton(
                            comment
                        );
                    }
                }
            );


        /*
         * Legacy comments.
         */

        document
            .querySelectorAll(
                '[data-testid="comment"]'
            )
            .forEach(
                comment => {

                    createDownloadButton(
                        comment
                    );
                }
            );
    }


    /*
     * ============================================================
     * MAIN SCAN
     * ============================================================
     */

    function scan() {

        scanPosts();

        scanComments();
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

                let relevant =
                    false;


                for (
                    const mutation
                    of mutations
                ) {

                    if (
                        mutation.addedNodes &&
                        mutation.addedNodes.length
                    ) {

                        relevant =
                            true;

                        break;
                    }
                }


                if (
                    !relevant
                ) {
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
     * PERIODIC SCAN
     * ============================================================
     *
     * Reddit frequently renders the following
     * independently:
     *
     * 1. Post
     * 2. Media
     * 3. Action row
     * 4. Vote buttons
     *
     * Therefore a periodic scan is intentional.
     *
     * ============================================================
     */

    setInterval(
        scan,
        CONFIG.SCAN_INTERVAL
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
     * INITIAL SCANS
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


    setTimeout(
        scan,
        5000
    );


    debug(
        'Reddit Media Downloader 2.5.0 loaded.'
    );

})();
