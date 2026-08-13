# Reddit Media Downloader

A simple userscript for downloading images and videos from Reddit posts and comments.

## Author

mrkwxopya

## Features

- Download images
- Download videos
- Download GIFs
- Download Reddit galleries
- Download media from comments
- Adds a Download button near the Upvote / Downvote controls
- Supports dynamically loaded Reddit content
- Generates filenames based on the Reddit post
- Uses the reddit-posts download folder
- No external downloader service
- No tracking or analytics

## Security

The script follows a Zero Trust approach.

All media URLs are treated as untrusted input and validated before downloading.

Only HTTPS URLs are allowed.

Only these Reddit media domains are trusted:

i.redd.it
preview.redd.it
external-preview.redd.it
v.redd.it

Arbitrary external domains are blocked.

The script also protects against:

- Malicious URLs
- Invalid protocols
- Path traversal
- Unsafe filenames
- Unexpected external domains

## File Names

Post:

POST_ID-POST_TITLE.jpg

Gallery:

POST_ID-POST_TITLE.jpg
POST_ID-POST_TITLE-2.jpg
POST_ID-POST_TITLE-3.jpg

Comment:

POST_ID-COMMENT_ID.jpg

## Download Folder

The preferred folder is:

Downloads/reddit-posts/

Actual folder behavior depends on the browser and userscript manager.

## Supported Media

Images:

JPG
PNG
WEBP
GIF

Videos:

MP4
WEBM
MOV
M4V

## Installation

1. Install Tampermonkey or Violentmonkey.
2. Create a new userscript.
3. Paste the Reddit Media Downloader script.
4. Save it.
5. Open Reddit.
6. Click Download on a supported post or comment.

## Reddit Videos

Some Reddit videos use separate video and audio streams.

The current version downloads media directly exposed by Reddit.

Video/audio merging may require an additional browser-side FFmpeg implementation in a future version.

## Limitations

Reddit may change its website structure at any time.

Changes to Reddit's:

- Post layout
- Comment layout
- Voting controls
- Gallery system
- Video player

may require an update to the script.

## Version

2.0.0

## Author

mrkwxopya
