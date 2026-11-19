# Video production

The release includes a 20-second square MP4 for Telegram: 1080×1080, 24 fps, H.264 video and AAC audio, with fast-start metadata. Russian captions accompany real recordings of the renderer. No personal account or listening history is recorded.

The demo cover and lyrics are original project assets. The soundtrack is synthesized by `scripts/render-promo.cjs`; it doesn't contain a downloaded song or a third-party recording. It is included under the project MIT licence.

To reproduce on Windows with Node.js and the project dependencies installed:

```sh
npm install --prefix .tools/media --no-audit --no-fund ffmpeg-static
npx electron . --capture-promo
npx electron scripts/render-promo.cjs
```

Capture uses an isolated temporary profile. It writes five app screenshots into `docs/screenshots/` and an intermediate interface recording into `artifacts/promo/`. The render step creates the README banner, video cover and `media/HexSound-telegram.mp4`. It decodes the whole output to check the encoded file, and writes a contact sheet for visual review.

The development-only capture switch is disabled in packaged builds. Demo data doesn't enter normal playback. Local build outputs are excluded from Git. The final MP4 is stored in `docs/media/HexSound-telegram.mp4` and attached to the GitHub release.
