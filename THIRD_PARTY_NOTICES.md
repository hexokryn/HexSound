# Third-party components

HexSound is MIT licensed. Third-party components retain their own licences.

## Qt

The C++ application dynamically links Qt Core, Gui, Widgets, Network, Quick, Quick Controls and WebEngine, plus their runtime modules. The release SDK is Qt 6.12.1 with Qt WebEngine 6.140.0. Earlier development builds used Qt 6.8.3. Qt is distributed under its applicable open-source licences, including LGPL-3.0 and the module-specific licences shipped by Qt.

Copies of [LGPL-3.0](native/licenses/LGPL-3.0.txt) and [GPL-3.0](native/licenses/GPL-3.0.txt) are provided. The application does not statically link Qt; the deployed Qt libraries can be replaced with compatible builds. Qt source and module licence information are available from [Qt's source repositories](https://code.qt.io/cgit/qt/) and [Qt licensing documentation](https://doc.qt.io/qt-6/licensing.html). Match the source version to the SDK used for your build.

## Chromium and WebEngine

Qt WebEngine includes Chromium and its third-party components. Preserve Qt WebEngine's resource packs, helper executable and licence notices when packaging. Chromium component notices are included in the engine's built-in credits. [Qt WebEngine licence information](https://doc.qt.io/qt-6/qtwebengine-licensing.html).

## Network services

SoundCloud supplies its website and playback service. LRCLIB supplies lyric data. Their service terms apply independently of HexSound's source licence. No audio, album artwork or lyric catalogue is bundled with this repository.

The JavaScript files under native/assets are HexSound's DOM bridge for the remote SoundCloud page. They are not a Node.js application.
