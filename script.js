// ==UserScript==
// @name         Reddit Media Downloader - Zero Trust
// @namespace    reddit-media-downloader
// @version      2.0.0
// @description  Securely download Reddit post and comment media with strict URL validation.
// @author       User
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @run-at       document-idle
//
// @license MIT
//
// @grant        GM_download
// @grant        GM_xmlhttpRequest
//
// @connect      reddit.com
// @connect      www.reddit.com
// @connect      old.reddit.com
// @connect      new.reddit.com
// @connect      i.redd.it
// @connect      preview.redd.it
// @connect      external-preview.redd.it
// @connect      v.redd.it
//
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/591125/Reddit%20Media%20Downloader%20-%20Zero%20Trust.user.js
// @updateURL https://update.greasyfork.org/scripts/591125/Reddit%20Media%20Downloader%20-%20Zero%20Trust.meta.js
// ==/UserScript==

(function () {
    'use strict';

    /*
     * ============================================================
     * Reddit Media Downloader V2
     * ============================================================
     *
     * Design goals:
     *
     * 1. Zero Trust
     *    - Never trust DOM-provided URLs.
     *    - Never trust arbitrary protocols.
     *    - Never trust arbitrary hosts.
     *    - Validate every download target.
     *
     * 2. No external downloader services.
     *
     * 3. No API credentials.
     *
     * 4. No cookies or authentication tokens are exported.
     *
     * 5. Only Reddit-owned/approved media hosts are accepted.
     *
     * 6. Dynamic Reddit SPA content is supported.
     *
     * 7. Posts, comments, galleries, images and Reddit videos
     *    are supported where the browser can access the media.
     *
     * ============================================================
     */

    'use strict';

    const CONFIG = Object.freeze({

        VERSION: '2.0.0',

        DOWNLOAD_DIRECTORY: 'reddit-posts',

        BUTTON_TEXT: 'Download',

        MAX_FILENAME_LENGTH: 160,

        MAX_URL_LENGTH: 4096,

        OBSERVER_DELAY: 250,

        RESCAN_INTERVAL: 3000,

        DEBUG: false
    });


    /*
     * ============================================================
     * Security: Host Allowlist
     * ============================================================
     */

    const ALLOWED_MEDIA_HOSTS = new Set([
        'i.redd.it',
        'preview.redd.it',
        'external-preview.redd.it',
        'v.redd.it'
    ]);


    const ALLOWED_REDDIT_HOSTS = new Set([
        'reddit.com',
        'www.reddit.com',
        'old.reddit.com',
        'new.reddit.com'
    ]);


    const ALLOWED_PROTOCOLS = new Set([
        'https:'
    ]);


    /*
     * ============================================================
     * Security helpers
     * ============================================================
     */

    function debug(...args) {

        if (!CONFIG.DEBUG) {
            return;
        }

        console.debug(
            '[Reddit Media Downloader]',
            ...args
        );
    }


    function isValidString(value) {

        return (
            typeof value === 'string' &&
            value.length > 0 &&
            value.length <= CONFIG.MAX_URL_LENGTH
        );
    }


    function parseSafeURL(value) {

        if (!isValidString(value)) {
            return null;
        }

        try {

            const url = new URL(
                value,
                window.location.origin
            );

            /*
             * Only HTTPS.
             */
            if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
                return null;
            }

            /*
             * Reject credentials.
             *
             * Example:
             * https://user:password@example.com
             */
            if (url.username || url.password) {
                return null;
            }

            return url;

        } catch {

            return null;
        }
    }


    function isAllowedMediaURL(value) {

        const url = parseSafeURL(value);

        if (!url) {
            return false;
        }

        /*
         * Exact hostname matching.
         *
         * Do NOT use:
         *
         * hostname.includes('redd.it')
         *
         * because:
         *
         * evil-redd.it
         *
         * could pass a weak check.
         */
        if (!ALLOWED_MEDIA_HOSTS.has(
            url.hostname.toLowerCase()
        )) {
            return false;
        }

        return true;
    }


    function isAllowedRedditURL(value) {

        const url = parseSafeURL(value);

        if (!url) {
            return false;
        }

        return ALLOWED_REDDIT_HOSTS.has(
            url.hostname.toLowerCase()
        );
    }


    /*
     * ============================================================
     * Filename security
     * ============================================================
     */

    function sanitizeFilename(value) {

        if (!isValidString(value)) {
            return 'reddit-media';
        }

        let filename = String(value);

        /*
         * Remove Windows reserved characters.
         */
        filename = filename.replace(
            /[<>:"/\\|?*\x00-\x1F]/g,
            ''
        );

        /*
         * Remove control characters.
         */
        filename = filename.replace(
            /[\u0000-\u001F\u007F]/g,
            ''
        );

        /*
         * Normalize whitespace.
         */
        filename = filename.replace(
            /\s+/g,
            ' '
        );

        /*
         * Prevent directory traversal.
         */
        filename = filename
            .replace(/\.\.+/g, '.')
            .replace(/^[/\\]+/, '')
            .replace(/[/\\]+/g, '');

        /*
         * Remove trailing periods/spaces.
         */
        filename = filename.replace(
            /[. ]+$/g,
            ''
        );

        /*
         * Prevent Windows reserved names.
         */
        const reservedNames = new Set([
            'CON',
            'PRN',
            'AUX',
            'NUL',
            'COM1',
            'COM2',
            'COM3',
            'COM4',
            'COM5',
            'COM6',
            'COM7',
            'COM8',
            'COM9',
            'LPT1',
            'LPT2',
            'LPT3',
            'LPT4',
            'LPT5',
            'LPT6',
            'LPT7',
            'LPT8',
            'LPT9'
        ]);

        if (reservedNames.has(
            filename.toUpperCase()
        )) {
            filename = `reddit-${filename}`;
        }

        if (!filename) {
            filename = 'reddit-media';
        }

        return filename.substring(
            0,
            CONFIG.MAX_FILENAME_LENGTH
        );
    }


    /*
     * ============================================================
     * Extension detection
     * ============================================================
     */

    function getExtensionFromURL(value) {

        const url = parseSafeURL(value);

        if (!url) {
            return null;
        }

        const pathname =
            url.pathname.toLowerCase();

        const match =
            pathname.match(
                /\.([a-z0-9]{2,5})$/
            );

        if (!match) {
            return null;
        }

        const extension = match[1];

        const allowedExtensions = new Set([
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif',
            'mp4',
            'webm',
            'mov',
            'm4v'
        ]);

        if (!allowedExtensions.has(extension)) {
            return null;
        }

        return extension === 'jpeg'
            ? 'jpg'
            : extension;
    }


    function getMediaType(url) {

        const extension =
            getExtensionFromURL(url);

        if (!extension) {

            if (
                url.includes('v.redd.it')
            ) {
                return 'video';
            }

            return 'unknown';
        }

        if (
            ['jpg', 'png', 'webp', 'gif']
                .includes(extension)
        ) {
            return 'image';
        }

        if (
            ['mp4', 'webm', 'mov', 'm4v']
                .includes(extension)
        ) {
            return 'video';
        }

        return 'unknown';
    }


    /*
     * ============================================================
     * Reddit post information
     * ============================================================
     */

    function findPostElement(element) {

        return (
            element.closest(
                'shreddit-post'
            ) ||
            element.closest(
                '[data-testid="post-container"]'
            ) ||
            element.closest(
                'article'
            )
        );
    }


    function findCommentElement(element) {

        return (
            element.closest(
                'shreddit-comment'
            ) ||
            element.closest(
                '[data-testid="comment"]'
            )
        );
    }


    function getPostId(element) {

        const post =
            findPostElement(element);

        if (!post) {
            return 'post';
        }

        const candidates = [

            post.getAttribute('id'),

            post.getAttribute(
                'data-post-id'
            ),

            post.getAttribute(
                'post-id'
            ),

            post.dataset?.postId
        ];

        for (const value of candidates) {

            if (
                typeof value === 'string' &&
                /^t3_[a-z0-9]+$/i.test(value)
            ) {
                return value;
            }

            if (
                typeof value === 'string' &&
                /^[a-z0-9]+$/i.test(value)
            ) {
                return value;
            }
        }

        return 'post';
    }


    function getCommentId(element) {

        const comment =
            findCommentElement(element);

        if (!comment) {
            return null;
        }

        const candidates = [

            comment.getAttribute(
                'thingid'
            ),

            comment.getAttribute(
                'data-comment-id'
            ),

            comment.dataset?.commentId,

            comment.id
        ];

        for (const value of candidates) {

            if (
                typeof value === 'string' &&
                value.length <= 100 &&
                /^[a-zA-Z0-9_-]+$/.test(value)
            ) {
                return value;
            }
        }

        return 'comment';
    }


    function getPostTitle(element) {

        const post =
            findPostElement(element);

        if (!post) {
            return 'reddit-post';
        }

        const candidates = [

            post.getAttribute(
                'post-title'
            ),

            post.querySelector(
                '[slot="title"]'
            )?.textContent,

            post.querySelector(
                'h1'
            )?.textContent,

            post.querySelector(
                'h2'
            )?.textContent,

            post.querySelector(
                'h3'
            )?.textContent
        ];

        for (const title of candidates) {

            if (
                typeof title === 'string' &&
                title.trim()
            ) {
                return sanitizeFilename(
                    title.trim()
                );
            }
        }

        return 'reddit-post';
    }


    /*
     * ============================================================
     * Media extraction
     * ============================================================
     */

    function collectDOMMedia(element) {

        const results = new Set();


        /*
         * Images
         */
        element
            .querySelectorAll('img')
            .forEach(img => {

                const candidates = [

                    img.currentSrc,

                    img.src,

                    img.getAttribute(
                        'data-src'
                    ),

                    img.getAttribute(
                        'src'
                    )
                ];

                for (const value of candidates) {

                    if (
                        isAllowedMediaURL(value)
                    ) {

                        results.add(value);

                        break;
                    }
                }
            });


        /*
         * Videos
         */
        element
            .querySelectorAll('video')
            .forEach(video => {

                if (
                    isAllowedMediaURL(
                        video.currentSrc
                    )
                ) {
                    results.add(
                        video.currentSrc
                    );
                }

                video
                    .querySelectorAll('source')
                    .forEach(source => {

                        if (
                            isAllowedMediaURL(
                                source.src
                            )
                        ) {
                            results.add(
                                source.src
                            );
                        }
                    });
            });


        /*
         * Direct media links
         */
        element
            .querySelectorAll('a[href]')
            .forEach(anchor => {

                const href = anchor.href;

                if (
                    isAllowedMediaURL(href)
                ) {
                    results.add(href);
                }
            });


        return [...results];
    }


    /*
     * ============================================================
     * Reddit video URL normalization
     * ============================================================
     */

    function normalizeRedditVideoURL(url) {

        if (!isAllowedMediaURL(url)) {
            return null;
        }

        const parsed =
            parseSafeURL(url);

        if (!parsed) {
            return null;
        }

        if (
            parsed.hostname !== 'v.redd.it'
        ) {
            return url;
        }

        /*
         * Only permit known Reddit video paths.
         */
        const path = parsed.pathname;

        const validVideoPath =
            /^\/[a-z0-9]+\/(?:DASH_[0-9]+|DASHPlaylist|HLSPlaylist)\.(?:mp4|mpd|m3u8)$/i;

        if (!validVideoPath.test(path)) {
            return null;
        }

        return parsed.toString();
    }


    /*
     * ============================================================
     * Build filename
     * ============================================================
     */

    function buildFilename(
        element,
        mediaURL,
        index
    ) {

        const postId =
            sanitizeFilename(
                getPostId(element)
            );

        const commentId =
            getCommentId(element);

        const title =
            getPostTitle(element);

        const type =
            getMediaType(mediaURL);


        let baseName;


        if (commentId) {

            baseName =
                `${postId}-${sanitizeFilename(commentId)}`;

        } else {

            baseName =
                `${postId}-${title}`;
        }


        if (index > 0) {

            baseName +=
                `-${index + 1}`;
        }


        let extension =
            getExtensionFromURL(
                mediaURL
            );


        if (!extension) {

            extension =
                type === 'video'
                    ? 'mp4'
                    : 'bin';
        }


        return (
            `${CONFIG.DOWNLOAD_DIRECTORY}/` +
            `${sanitizeFilename(baseName)}.` +
            `${extension}`
        );
    }


    /*
     * ============================================================
     * Safe download
     * ============================================================
     */

    function downloadMedia(
        url,
        filename
    ) {

        /*
         * Final trust check immediately
         * before download.
         */
        if (!isAllowedMediaURL(url)) {

            console.warn(
                '[Reddit Downloader] ' +
                'Blocked untrusted URL:',
                url
            );

            return;
        }


        if (
            typeof GM_download !== 'function'
        ) {

            fallbackDownload(
                url,
                filename
            );

            return;
        }


        try {

            GM_download({

                url,

                name: filename,

                saveAs: false,

                timeout: 60000,

                onload() {

                    debug(
                        'Download completed:',
                        filename
                    );
                },

                onerror(error) {

                    console.error(
                        '[Reddit Downloader] ' +
                        'Download failed:',
                        error
                    );
                },

                ontimeout() {

                    console.error(
                        '[Reddit Downloader] ' +
                        'Download timed out:',
                        filename
                    );
                }
            });

        } catch (error) {

            console.error(
                '[Reddit Downloader] ' +
                'Download exception:',
                error
            );
        }
    }


    function fallbackDownload(
        url,
        filename
    ) {

        /*
         * Re-validate.
         */
        if (!isAllowedMediaURL(url)) {
            return;
        }


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
     * Download button
     * ============================================================
     */

    function createDownloadButton(
        container
    ) {

        if (
            container.dataset
                .redditDownloaderProcessed === '1'
        ) {
            return;
        }


        const media =
            collectDOMMedia(
                container
            );


        if (!media.length) {
            return;
        }


        container.dataset
            .redditDownloaderProcessed = '1';


        /*
         * Prevent duplicate buttons.
         */
        if (
            container.querySelector(
                '.reddit-media-downloader-button'
            )
        ) {
            return;
        }


        const button =
            document.createElement('button');


        button.type = 'button';

        button.className =
            'reddit-media-downloader-button';


        button.textContent =
            CONFIG.BUTTON_TEXT;


        /*
         * Accessibility.
         */
        button.setAttribute(
            'aria-label',
            'Download Reddit media'
        );


        button.title =
            'Download media from this Reddit post/comment';


        /*
         * Minimal styling.
         */
        button.style.cssText = `
            appearance: none;
            border: 0;
            background: transparent;
            color: inherit;
            font: inherit;
            font-size: 12px;
            font-weight: 600;
            line-height: 1;
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


        button.addEventListener(
            'click',
            async event => {

                event.preventDefault();

                event.stopPropagation();


                button.disabled = true;

                const originalText =
                    button.textContent;


                button.textContent =
                    'Downloading...';


                try {

                    /*
                     * Re-scan at click time.
                     *
                     * This is important because
                     * Reddit may replace the media
                     * element after initial page load.
                     */
                    const currentMedia =
                        collectDOMMedia(
                            container
                        );


                    if (!currentMedia.length) {

                        button.textContent =
                            'No media';

                        return;
                    }


                    for (
                        let index = 0;
                        index < currentMedia.length;
                        index++
                    ) {

                        const rawURL =
                            currentMedia[index];


                        /*
                         * Final URL normalization.
                         */
                        const safeURL =
                            normalizeRedditVideoURL(
                                rawURL
                            ) || (
                                isAllowedMediaURL(
                                    rawURL
                                )
                                    ? rawURL
                                    : null
                            );


                        if (!safeURL) {
                            continue;
                        }


                        const filename =
                            buildFilename(
                                container,
                                safeURL,
                                index
                            );


                        downloadMedia(
                            safeURL,
                            filename
                        );


                        /*
                         * Small delay prevents
                         * browser download throttling.
                         */
                        await sleep(150);
                    }


                    button.textContent =
                        'Downloaded';

                } catch (error) {

                    console.error(
                        '[Reddit Downloader] ',
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


        insertButton(
            container,
            button
        );
    }


    /*
     * ============================================================
     * Button placement
     * ============================================================
     */

    function insertButton(
        container,
        button
    ) {

        /*
         * Preferred: Reddit vote container.
         */
        const voteContainers = [

            container.querySelector(
                '[data-testid="vote-arrows"]'
            ),

            container.querySelector(
                '[slot="vote-buttons"]'
            ),

            container.querySelector(
                'faceplate-tracker[noun="upvote"]'
            )?.parentElement
        ];


        for (
            const voteContainer
            of voteContainers
        ) {

            if (
                voteContainer &&
                voteContainer.parentElement
            ) {

                voteContainer
                    .parentElement
                    .insertBefore(
                        button,
                        voteContainer
                    );

                return true;
            }
        }


        /*
         * Direct upvote button.
         */
        const upvote =
            container.querySelector(
                'button[aria-label*="upvote" i]'
            );


        if (upvote?.parentElement) {

            upvote.parentElement
                .insertBefore(
                    button,
                    upvote
                );

            return true;
        }


        /*
         * Old Reddit.
         */
        const buttons =
            container.querySelector(
                '.buttons'
            );


        if (buttons) {

            buttons.insertBefore(
                button,
                buttons.firstChild
            );

            return true;
        }


        /*
         * Fallback.
         */
        const media =
            container.querySelector(
                'img, video'
            );


        if (media?.parentElement) {

            media.parentElement
                .insertBefore(
                    button,
                    media
                );

            return true;
        }


        return false;
    }


    /*
     * ============================================================
     * Scanner
     * ============================================================
     */

    function scan() {

        /*
         * Posts.
         */
        document
            .querySelectorAll(
                'shreddit-post, ' +
                '[data-testid="post-container"], ' +
                'article'
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
     * Mutation Observer
     * ============================================================
     */

    let scanTimer = null;


    const observer =
        new MutationObserver(
            mutations => {

                let hasNewContent = false;


                for (
                    const mutation
                    of mutations
                ) {

                    if (
                        mutation.type ===
                        'childList' &&
                        mutation.addedNodes.length
                    ) {

                        hasNewContent = true;

                        break;
                    }
                }


                if (!hasNewContent) {
                    return;
                }


                clearTimeout(
                    scanTimer
                );


                scanTimer =
                    setTimeout(
                        scan,
                        CONFIG.OBSERVER_DELAY
                    );
            }
        );


    /*
     * ============================================================
     * Start observer
     * ============================================================
     */

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );


    /*
     * ============================================================
     * SPA navigation
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


                /*
                 * Reddit is a SPA.
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
            }

        },
        1000
    );


    /*
     * ============================================================
     * Utility
     * ============================================================
     */

    function sleep(ms) {

        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }


    /*
     * ============================================================
     * Initial scans
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
        `Reddit Media Downloader V${CONFIG.VERSION} loaded.`
    );

})();
