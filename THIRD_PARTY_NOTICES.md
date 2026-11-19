# Third-party components

HexSound is MIT licensed. Dependencies retain their own licences.

- [HLS.js](https://github.com/video-dev/hls.js), version 1.7.4: Apache License 2.0. The local browser bundle is copied from the pinned npm dependency during installation; its full licence is included at [src/vendor/hls.LICENSE](src/vendor/hls.LICENSE).
- [music-metadata](https://github.com/Borewit/music-metadata), version 12.7.0: MIT. Used in the main process to read local audio metadata. It and its production dependencies are packaged with their npm licence files.
- [Electron](https://github.com/electron/electron): MIT, with Chromium and other component notices included in packaged distributions.

`npm ci` installs versions fixed by package-lock.json. `scripts/copy-vendor.cjs` copies the browser bundle from that installation, with no runtime script downloads.
