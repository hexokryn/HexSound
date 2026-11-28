# HexSound

[Русский](README.md) · [English](README.en.md) · [Releases](https://github.com/hexokryn/HexSound/releases/latest) · [Author's Telegram](https://t.me/zexokkydev)

SoundCloud desktop player for Windows, written in C++20 and Qt Quick/QML. SoundCloud runs in Qt WebEngine with the HexSound theme; the native shell provides navigation, a persistent player, lyrics and settings. Node.js and Electron are not required. Linux has a separate CI job and is not included in the new release.

![Native settings](docs/screenshots/native-settings-dark.png)

- 32 palettes, custom backgrounds, optional effects and reduced motion
- Collapsible navigation and settings grouped by purpose, with search
- Playback controls and volume connected to the same SoundCloud page
- Synced lyrics from LRCLIB or a local LRC file
- Personal radio from SoundCloud likes and artist searches, without API keys
- CSV, TSV and JSON import into a new SoundCloud playlist after reviewing matches
- Top-bar updates from GitHub Releases with size and SHA-256 checks, backup and rollback; no Setup for subsequent updates
- Discord Rich Presence with your own public Application ID

Listening uses an ordinary SoundCloud login inside the app. Playlist creation requires separate SoundCloud API authorization. No browser cookies or session tokens are extracted for API use. Availability of music depends on SoundCloud and your region.

## Download

[Windows Setup 0.13.0](https://github.com/hexokryn/HexSound/releases/download/v0.13.0/HexSound-0.13.0-setup.exe) · [Portable ZIP](https://github.com/hexokryn/HexSound/releases/download/v0.13.0/HexSound-0.13.0-native-portable.zip) · [SHA-256](https://github.com/hexokryn/HexSound/releases/download/v0.13.0/HexSound-0.13.0-SHA256SUMS.txt)

Setup installs for the current user. For portable use, extract the entire ZIP and run `HexSound.exe`. Use Setup to migrate from Electron; subsequent native updates run inside the app. The installer is not code-signed. Earlier Linux packages remain in the [archived 0.11.0 release](https://github.com/hexokryn/HexSound/releases/tag/v0.11.0).

## Development build

Requires CMake 3.21+, C++20, MSVC 2022 on Windows and Qt 6.8+ with Quick, Quick Controls, WebEngine, WebChannel, Positioning and ShaderTools. The release SDK is Qt 6.12.1 with Qt WebEngine 6.140.0. The download script needs Python 3.12+ and verifies archive checksums from Qt's official repositories. Python is not an application dependency.

```powershell
python scripts/install-qt.py
./scripts/build-native.ps1 -Test -Deploy
./release/HexSound-native/HexSound.exe
```

Keep the complete deployed folder, including Qt libraries and resources. The `portable` marker stores profile data beside the executable. The C++ application uses a separate WebEngine profile, so sign in again; the installed Electron version's data is preserved.

Use `-QtRoot C:/Qt/6.12.1/msvc2022_64` for your own installed SDK. Build the Setup and portable ZIP with `./scripts/package-native.ps1` after installing NSIS. Automated checks use local audio and API fixtures; private-account login and real API writes require separate testing.

[Architecture and checks, Russian](docs/development.ru.md) · [Linux](docs/linux.md) · [File import](docs/library-import.md) · [SoundCloud API](docs/services.md)

Unofficial client; not affiliated with SoundCloud. [MIT](LICENSE).
