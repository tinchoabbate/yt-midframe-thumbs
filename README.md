# YouTube Midpoint Thumbnails (Firefox & Chrome)

Replaces YouTube's uploader-chosen thumbnails with YouTube's own auto-generated
frame from halfway through the video (`i.ytimg.com/vi/<id>/hq2.jpg`).
It can also hide YouTube Shorts: Shorts shelves, Shorts mixed into feeds and search,
the Shorts sidebar entry and channel tab. `/shorts/<id>` links open in the normal player.

Click the toolbar icon for two independent switches: **Midpoint thumbnails** and **Hide Shorts**.
Requires Firefox 128+ or Chrome 111+ (or another Chromium browser: Edge, Brave, Vivaldi…).

If a video has no midpoint frame (live streams, some premieres), the original thumbnail stays.

## Build

```sh
./build.sh
```

Creates in `dist/`:
- `youtube-midpoint-thumbnails-<version>-firefox.zip`
- `youtube-midpoint-thumbnails-<version>-chrome.zip`
- `chrome/`, the unpacked Chrome version

The code in `src/` is shared; the Chrome manifest is the Firefox one without the Firefox-only keys.

## Chrome

**Use it yourself:** open `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked** and pick `dist/chrome`. It stays installed across restarts.

**Publish on the Chrome Web Store:** register at https://chrome.google.com/webstore/devconsole
(one-time fee), click **New item**, upload the `-chrome.zip`, fill in the listing and submit for review.

## Firefox

**Try it (until Firefox restarts):** open `about:debugging#/runtime/this-firefox`,
click **Load Temporary Add-on…** and pick `src/manifest.json`.

**Install permanently:** release Firefox only installs signed add-ons. Sign it as an unlisted
(self-distributed) add-on with your free addons.mozilla.org account:

1. Create API keys at https://addons.mozilla.org/developers/addon/api/key/
2. Run:
   ```sh
   npx web-ext sign -s src -a dist --channel unlisted \
     --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
   ```
3. Open the signed `.xpi` from `dist/` in Firefox (drag it in, or File → Open) and confirm.

Lint: `npx web-ext lint -s src`
