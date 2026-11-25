# HexSound

[Русский](README.md) · [English](README.en.md) · [Download](https://github.com/hexokryn/HexSound/releases/latest) · [Developer’s Telegram](https://t.me/zexokkydev)

SoundCloud for Windows and Linux with the HexSound interface. Browse, feed, likes and playlists use the official web player. Sign in inside the app; your session persists between launches. The interface is in Russian.

![Lyrics screen](docs/screenshots/player-dark.png)

- Bottom playback controls and a dedicated lyrics screen
- 32 themes, background effects, motion settings and a collapsible sidebar
- Personal radio based on SoundCloud likes, without API keys
- CSV, TSV and JSON imports into a new SoundCloud playlist after match review
- Verified updates from GitHub Releases

Listening uses normal SoundCloud sign-in. Importing a file does not change your account: creating a playlist requires SoundCloud API access and reviewed matches. Track availability depends on SoundCloud and your region. Lyrics come from LRCLIB or your LRC file.

## Download

[Windows Setup](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-setup.exe) · [Windows Portable](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-portable.exe)

[Linux AppImage](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-linux-x86_64.AppImage) · [DEB](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-linux-amd64.deb) · [tar.gz](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-linux-x64.tar.gz)

Versions 0.9.2 and earlier need one manual installation because their updater fails on GitHub redirects. Your SoundCloud session and appearance settings are preserved. Other services have been removed from the app; old user data files are not deleted automatically.

## Development

Electron, HTML/CSS and JavaScript. No Rust build.

```sh
npm ci
npm test
npm start
npm run dist -- --publish never
npm run dist:linux -- --publish never
```

[Development guide](docs/development.ru.md) · [Playback and radio](docs/experience.md) · [File imports](docs/library-import.md) · [SoundCloud API](docs/services.md)

Unofficial client, not affiliated with SoundCloud. [MIT](LICENSE).
