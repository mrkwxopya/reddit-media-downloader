// ==UserScript==
// @name         Reddit Media Downloader - Zero Trust
// @namespace    reddit-media-downloader
// @version      2.4.0
// @description  Securely download Reddit post and comment media.
// @author       mrkwxopya
// @license      MIT
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
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
     * Version 2.4.0
     * Author: mrkwxopya
     * License: MIT
     * ============================================================
     */

    const CONFIG = Object.freeze({
        DOWNLOAD_FOLDER: 'reddit-posts',
        BUTTON_TEXT: 'Download',
        DEBUG: false,
        SCAN_INTERVAL: 1000
    });


    /*
     * ============================================================
     * TRUSTED MEDIA HOSTS
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


    /*
     * ============================================================
     * EXTENSION
     * ============================================================
     */

    function getExtension(url) {

        const parsed =
            parseURL(url);


        if (!parsed) {
            return null;
        }


        const match =
            parsed.pathname
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
     * FILENAME
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


    /*
     * ============================================================
     * DEEP DOM
     * ============================================================
     */

    function walkTree(
        root,
        callback
    ) {

        if (!root) {
            return;
        }


        callback(root);


        if (
            !root.querySelectorAll
        ) {
            return;
        }


        const elements =
            root.querySelectorAll('*');


        for (
            const element
            of elements
        ) {

            if (
                element.shadowRoot
            ) {

                walkTree(
                    element.shadowRoot,
                    callback
                );
            }
        }
    }


    function queryAllDeep(
        root,
        selector
    ) {

        const results = [];


        walkTree(
            root,
            currentRoot => {

                if (
                    !currentRoot.querySelectorAll
                ) {
                    return;
                }


                currentRoot
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
        );


        return results;
    }


    function queryDeep(
        root,
        selectors
    ) {

        for (
            const selector
            of selectors
        ) {

            const result =
                queryAllDeep(
                    root,
                    selector
                );


            if (
                result.length
            ) {
                return result[0];
            }
        }


        return null;
    }


    /*
     * ============================================================
     * POST / COMMENT
     * ============================================================
     */

    function getPostElement(
        element
    ) {

        if (
            !element
        ) {
            return null;
        }


        return (
            element.closest?.(
                'shreddit-post'
            ) ||
            element.closest?.(
                '[data-testid="post-container"]'
            )
        );
    }


    function getCommentElement(
        element
    ) {

        if (
            !element
        ) {
            return null;
        }


        return (
            element.closest?.(
                'shreddit-comment'
            ) ||
            element.closest?.(
                '[data-testid="comment"]'
            )
        );
    }


    /*
     * ============================================================
     * OWNER
     * ============================================================
     *
     * Determines whether the element belongs to:
     *
     * - A normal post
     * - The main post
     * - A comment
     *
     * ============================================================
     */

    function getOwner(
        element
    ) {

        if (
            !element
        ) {
            return null;
        }


        const post =
            getPostElement(
                element
            );


        if (post) {
            return post;
        }


        const comment =
            getCommentElement(
                element
            );


        if (comment) {
            return comment;
        }


        /*
         * Reddit can expose the main post
         * through a different container.
         *
         * Search upward manually.
         */

        let current =
            element;


        while (
            current &&
            current !== document.body
        ) {

            if (
                current.tagName
                    ?.toLowerCase() ===
                'shreddit-post'
            ) {
                return current;
            }


            if (
                current.tagName
                    ?.toLowerCase() ===
                'shreddit-comment'
            ) {
                return current;
            }


            current =
                current.parentElement;
        }


        return null;
    }


    /*
     * ============================================================
     * POST ID
     * ============================================================
     */

    function getPostID(
        element
    ) {

        const post =
            getPostElement(
                element
            );


        if (
            !post
        ) {
            return null;
        }


        const candidates = [
            post.getAttribute(
                'id'
            ),
            post.getAttribute(
                'post-id'
            ),
            post.getAttribute(
                'data-post-id'
            ),
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


            const t3 =
                value.match(
                    /^t3_([a-z0-9]+)$/i
                );


            if (
                t3
            ) {
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
         * Fallback:
         *
         * Extract ID from the post URL.
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


            if (
                !href
            ) {
                continue;
            }


            const match =
                href.match(
                    /\/comments\/([a-z0-9]+)/i
                );


            if (
                match
            ) {
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
        element
    ) {

        const comment =
            getCommentElement(
                element
            );


        if (
            !comment
        ) {
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


            const t1 =
                value.match(
                    /^t1_([a-z0-9]+)$/i
                );


            if (
                t1
            ) {
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


    /*
     * ============================================================
     * MEDIA COLLECTION
     * ============================================================
     */

    function collectMedia(
        owner
    ) {

        const media =
            new Set();


        /*
         * Explicit Reddit media links only.
         *
         * This prevents avatars/icons from
         * being downloaded.
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
                    !href ||
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
         * Actual video elements.
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


    function getMedia(
        element
    ) {

        const owner =
            getOwner(
                element
            );


        if (
            !owner
        ) {
            return [];
        }


        return collectMedia(
            owner
        );
    }


    /*
     * ============================================================
     * FIND UPVOTE
     * ============================================================
     */

    function findUpvote(
        owner
    ) {

        /*
         * Current Reddit selectors.
         */

        const selectors = [

            'button[aria-label="Upvote"]',

            'button[aria-label="upvote"]',

            'button[aria-label*="upvote" i]',

            '[data-testid="upvote-button"]',

            '[data-event-action="upvote"]',

            '[slot="vote-button"]',

            'faceplate-tracker[noun="upvote"]',

            /*
             * Reddit vote component.
             */

            'button[id*="upvote" i]',

            /*
             * Old Reddit.
             */

            '.arrow.up'
        ];


        return queryDeep(
            owner,
            selectors
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

        if (
            !upvote
        ) {
            return null;
        }


        /*
         * Usually the immediate parent.
         */

        let parent =
            upvote.parentElement;


        if (
            !parent
        ) {
            return null;
        }


        /*
         * If the parent is a button-like
         * wrapper, move one level upward.
         */

        const tag =
            parent.tagName
                ?.toLowerCase();


        if (
            tag === 'button' ||
            tag === 'faceplate-tracker'
        ) {
            parent =
                parent.parentElement;
        }


        return parent;
    }


    /*
     * ============================================================
     * CREATE BUTTON
     * ============================================================
     */

    function createButton(
        owner
    ) {

        if (
            !owner
        ) {
            return;
        }


        /*
         * Already exists?
         */

        if (
            queryAllDeep(
                owner,
                '.reddit-media-download-button'
            ).length
        ) {
            return;
        }


        /*
         * Media must exist.
         */

        const media =
            getMedia(
                owner
            );


        if (
            !media.length
        ) {
            return;
        }


        /*
         * Find Upvote.
         */

        const upvote =
            findUpvote(
                owner
            );


        if (
            !upvote
        ) {

            debug(
                'Upvote not found yet'
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
         * ========================================================
         * BUTTON
         * ========================================================
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


        button.title =
            'Download media';


        button.setAttribute(
            'aria-label',
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
         * DOWNLOAD
         * ========================================================
         */

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

                    const currentMedia =
                        [
                            ...new Set(
                                getMedia(
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


                    for (
                        let i = 0;
                        i < currentMedia.length;
                        i++
                    ) {

                        const url =
                            currentMedia[i];


                        /*
                         * Zero Trust check.
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
         * INSERT BEFORE UPVOTE
         * ========================================================
         */

        container.insertBefore(
            button,
            upvote
        );


        debug(
            'Download button added'
        );
    }


    /*
     * ============================================================
     * SCAN MAIN POSTS
     * ============================================================
     *
     * This specifically handles:
     *
     * 1. Reddit homepage
     * 2. Subreddit pages
     * 3. Search results
     * 4. Post detail pages
     * 5. Main post inside /comments/
     *
     * ============================================================
     */

    function scanPosts() {

        document
            .querySelectorAll(
                'shreddit-post'
            )
            .forEach(
                post => {

                    createButton(
                        post
                    );
                }
            );


        /*
         * Fallback for older Reddit DOM.
         */

        document
            .querySelectorAll(
                '[data-testid="post-container"]'
            )
            .forEach(
                post => {

                    createButton(
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

        document
            .querySelectorAll(
                'shreddit-comment'
            )
            .forEach(
                comment => {

                    createButton(
                        comment
                    );
                }
            );


        document
            .querySelectorAll(
                '[data-testid="comment"]'
            )
            .forEach(
                comment => {

                    createButton(
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


                if (
                    !changed
                ) {
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
     * PERIODIC SCAN
     * ============================================================
     *
     * This is intentional.
     *
     * Reddit often renders:
     *
     * POST
     * ↓
     * MEDIA
     * ↓
     * VOTE CONTROLS
     *
     * at different times.
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
     * INITIAL
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
        'Reddit Media Downloader 2.4.0 loaded.'
    );

})();
