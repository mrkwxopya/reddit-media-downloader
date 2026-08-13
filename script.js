// ==UserScript==
// @name         Reddit Media Downloader - Zero Trust
// @namespace    reddit-media-downloader
// @version      2.6.0
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

    const CONFIG = Object.freeze({
        DOWNLOAD_FOLDER: 'reddit-posts',
        BUTTON_TEXT: 'Download',
        DEBUG: false
    });

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


    // ============================================================
    // DEBUG
    // ============================================================

    function debug(...args) {
        if (CONFIG.DEBUG) {
            console.debug(
                '[Reddit Downloader]',
                ...args
            );
        }
    }


    // ============================================================
    // URL VALIDATION
    // ============================================================

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

            if (
                url.protocol !== 'https:'
            ) {
                return null;
            }

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


    // ============================================================
    // EXTENSION
    // ============================================================

    function getExtension(value) {

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


    function getMediaType(value) {

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


    // ============================================================
    // FILENAME
    // ============================================================

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

        return (
            result.substring(
                0,
                160
            ) ||
            'reddit-media'
        );
    }


    // ============================================================
    // SHADOW DOM
    // ============================================================

    function getShadowRoot(element) {

        if (!element) {
            return null;
        }

        return element.shadowRoot || null;
    }


    function queryDeep(
        root,
        selectors
    ) {

        if (!root) {
            return null;
        }

        for (
            const selector
            of selectors
        ) {

            try {

                const result =
                    root.querySelector(
                        selector
                    );

                if (result) {
                    return result;
                }

            } catch {
                // Ignore invalid selectors.
            }
        }


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

            try {

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

            } catch {
                return results;
            }
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


    // ============================================================
    // POST ID
    // ============================================================

    function getPostID(post) {

        if (!post) {
            return null;
        }


        const attributes = [
            'post-id',
            'data-post-id',
            'id'
        ];


        for (
            const attribute
            of attributes
        ) {

            const value =
                post.getAttribute(
                    attribute
                );

            if (!value) {
                continue;
            }


            const t3 =
                value.match(
                    /^t3_([a-z0-9]+)$/i
                );

            if (t3) {
                return t3[1];
            }


            if (
                /^[a-z0-9]+$/i.test(
                    value
                )
            ) {
                return value;
            }
        }


        /*
         * Last resort:
         * Find /comments/POST_ID/
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


    // ============================================================
    // COMMENT ID
    // ============================================================

    function getCommentID(comment) {

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


    // ============================================================
    // MEDIA
    // ============================================================

    function collectMedia(owner) {

        const media =
            new Set();

        if (!owner) {
            return [];
        }


        /*
         * Only explicitly trusted Reddit media
         * links are accepted.
         *
         * This prevents avatars/icons/etc.
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

                if (!href) {
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
         * Video sources.
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


    // ============================================================
    // BUTTON EXISTENCE
    // ============================================================
    //
    // This fixes the repeated comment buttons.
    //
    // We check:
    //
    // 1. Host DOM
    // 2. Owner Shadow DOM
    // 3. Nested Shadow DOM
    //
    // ============================================================

    function hasDownloadButton(owner) {

        if (!owner) {
            return true;
        }


        if (
            owner.querySelector?.(
                '.reddit-media-download-button'
            )
        ) {
            return true;
        }


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
            return true;
        }


        const deep =
            queryDeep(
                owner,
                [
                    '.reddit-media-download-button'
                ]
            );


        return Boolean(
            deep
        );
    }


    // ============================================================
    // FIND POST UPVOTE
    // ============================================================
    //
    // Dedicated path for the main post.
    //
    // ============================================================

    function findPostUpvote(post) {

        if (!post) {
            return null;
        }


        /*
         * Current Reddit:
         */

        const shadow =
            getShadowRoot(
                post
            );


        if (shadow) {

            const direct =
                shadow.querySelector(
                    'button[upvote]'
                );


            if (direct) {
                return direct;
            }


            const selectors = [
                'button[aria-label="Upvote"]',
                'button[aria-label="upvote"]',
                'button[aria-label*="upvote" i]',
                '[data-testid="upvote-button"]',
                '[data-event-action="upvote"]'
            ];


            for (
                const selector
                of selectors
            ) {

                const result =
                    shadow.querySelector(
                        selector
                    );

                if (result) {
                    return result;
                }
            }
        }


        /*
         * Deep fallback.
         */

        return queryDeep(
            post,
            [
                'button[upvote]',
                'button[aria-label="Upvote"]',
                'button[aria-label="upvote"]',
                'button[aria-label*="upvote" i]',
                '[data-testid="upvote-button"]',
                '[data-event-action="upvote"]'
            ]
        );
    }


    // ============================================================
    // FIND COMMENT UPVOTE
    // ============================================================

    function findCommentUpvote(comment) {

        if (!comment) {
            return null;
        }


        const shadow =
            getShadowRoot(
                comment
            );


        if (shadow) {

            const direct =
                shadow.querySelector(
                    'button[upvote]'
                );


            if (direct) {
                return direct;
            }


            const selectors = [
                'button[aria-label="Upvote"]',
                'button[aria-label="upvote"]',
                'button[aria-label*="upvote" i]',
                '[data-testid="upvote-button"]',
                '[data-event-action="upvote"]'
            ];


            for (
                const selector
                of selectors
            ) {

                const result =
                    shadow.querySelector(
                        selector
                    );

                if (result) {
                    return result;
                }
            }
        }


        return queryDeep(
            comment,
            [
                'button[upvote]',
                'button[aria-label="Upvote"]',
                'button[aria-label="upvote"]',
                'button[aria-label*="upvote" i]',
                '[data-testid="upvote-button"]',
                '[data-event-action="upvote"]'
            ]
        );
    }


    // ============================================================
    // VOTE CONTAINER
    // ============================================================

    function findVoteContainer(upvote) {

        if (!upvote) {
            return null;
        }


        /*
         * Current Reddit structure:
         *
         * action container
         *   ├── upvote
         *   ├── score
         *   └── downvote
         *
         * We use the direct parent.
         */

        return (
            upvote.parentElement ||
            null
        );
    }


    // ============================================================
    // FILENAME
    // ============================================================

    function buildFilename(
        owner,
        url,
        index
    ) {

        let baseName =
            null;


        if (
            owner.matches?.(
                'shreddit-post'
            )
        ) {

            baseName =
                getPostID(
                    owner
                );

        } else if (
            owner.matches?.(
                'shreddit-comment'
            )
        ) {

            baseName =
                getCommentID(
                    owner
                );
        }


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
         * Gallery:
         *
         * abc123.jpg
         * abc123-2.jpg
         * abc123-3.jpg
         */

        if (
            index > 0
        ) {

            baseName +=
                `-${index + 1}`;
        }


        let extension =
            getExtension(
                url
            );


        if (!extension) {

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


    // ============================================================
    // DOWNLOAD
    // ============================================================

    function downloadMedia(
        url,
        filename
    ) {

        /*
         * Final Zero Trust validation.
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
            typeof filename !== 'string' ||
            !filename.startsWith(
                `${CONFIG.DOWNLOAD_FOLDER}/`
            )
        ) {

            console.warn(
                '[Reddit Downloader] ' +
                'Blocked filename:',
                filename
            );

            return;
        }


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
                        '[Reddit Downloader]',
                        error
                    );
                }

            });

            return;
        }


        /*
         * Fallback.
         */

        const link =
            document.createElement(
                'a'
            );


        link.href =
            url;


        link.download =
            filename;


        link.target =
            '_blank';


        link.rel =
            'noopener noreferrer';


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();
    }


    // ============================================================
    // CREATE BUTTON
    // ============================================================

    function createDownloadButton(
        owner,
        type
    ) {

        if (!owner) {
            return;
        }


        /*
         * IMPORTANT:
         *
         * Do not create another button if one
         * already exists.
         */

        if (
            hasDownloadButton(
                owner
            )
        ) {
            return;
        }


        /*
         * Find media.
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
         * Find the correct Upvote.
         */

        const upvote =
            type === 'post'
                ? findPostUpvote(owner)
                : findCommentUpvote(owner);


        if (
            !upvote
        ) {

            debug(
                'Waiting for upvote:',
                type
            );

            return;
        }


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
         * Double check immediately before
         * insertion.
         */

        if (
            container.querySelector?.(
                '.reddit-media-download-button'
            )
        ) {
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


        button.setAttribute(
            'title',
            'Download media'
        );


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


        // ========================================================
        // DOWNLOAD CLICK
        // ========================================================

        button.addEventListener(
            'click',
            async event => {

                event.preventDefault();

                event.stopPropagation();


                const original =
                    button.textContent;


                button.disabled =
                    true;


                button.textContent =
                    'Downloading...';


                try {

                    /*
                     * Refresh media list.
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
                     * Download only unique URLs.
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
                                owner,
                                url,
                                i
                            );


                        downloadMedia(
                            url,
                            filename
                        );


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
                                original;

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
         */

        container.insertBefore(
            button,
            upvote
        );


        debug(
            'Button added:',
            type
        );
    }


    // ============================================================
    // SCAN MAIN POSTS
    // ============================================================

    function scanPosts() {

        document
            .querySelectorAll(
                'shreddit-post'
            )
            .forEach(
                post => {

                    createDownloadButton(
                        post,
                        'post'
                    );
                }
            );
    }


    // ============================================================
    // SCAN COMMENTS
    // ============================================================

    function scanComments() {

        /*
         * ONLY scan shreddit-comment.
         *
         * We intentionally DO NOT separately scan
         * shreddit-comment-action-row.
         *
         * That was the cause of duplicate buttons.
         */

        document
            .querySelectorAll(
                'shreddit-comment'
            )
            .forEach(
                comment => {

                    createDownloadButton(
                        comment,
                        'comment'
                    );
                }
            );
    }


    // ============================================================
    // SCAN
    // ============================================================

    function scan() {

        scanPosts();

        scanComments();
    }


    // ============================================================
    // MUTATION OBSERVER
    // ============================================================

    let scanTimeout =
        null;


    function scheduleScan(
        delay = 250
    ) {

        clearTimeout(
            scanTimeout
        );


        scanTimeout =
            setTimeout(
                scan,
                delay
            );
    }


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
                    relevant
                ) {
                    scheduleScan();
                }
            }
        );


    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );


    // ============================================================
    // SPA NAVIGATION
    // ============================================================

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


                /*
                 * Reddit route changed.
                 *
                 * Wait for the new post/action row.
                 */

                scheduleScan(300);


                setTimeout(
                    scan,
                    1000
                );


                setTimeout(
                    scan,
                    2000
                );
            }

        },
        500
    );


    // ============================================================
    // INITIAL SCAN
    // ============================================================

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
        'Reddit Media Downloader 2.6.0 loaded.'
    );

})();
