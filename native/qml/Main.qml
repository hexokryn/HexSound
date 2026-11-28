import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import QtWebEngine
import QtQuick.Effects

ApplicationWindow {
    id: app
    objectName: "mainWindow"
    width: 1320; height: 860
    minimumWidth: 760; minimumHeight: 600
    visible: true
    title: "HexSound"
    color: Backend.colors.bg
    font.family: Qt.platform.os === "windows" ? "Segoe UI Variable" : "Sans Serif"
    palette.window: Backend.colors.bg
    palette.windowText: Backend.colors.ink
    palette.text: Backend.colors.ink
    palette.base: Backend.colors.surface
    palette.button: Backend.colors.raised
    palette.buttonText: Backend.colors.ink
    palette.highlight: Backend.colors.accent
    property bool foreground: visible && visibility !== Window.Minimized
    property bool compact: true
    property int section: 0
    HoverHandler { id: backgroundPointer; parent: app.contentItem }
    TapHandler { parent: app.contentItem; onTapped: if(atmosphereLoader.item)atmosphereLoader.item.pulse=1 }
    property string settingsSearch: ""
    property real playPosition: Backend.position
    property var choices: ({})
    property string workerTicket: ""
    property int workerPasses: 0
    property int workerStable: 0
    property int workerCount: -1
    property bool workerReady: false
    property var worker: null
    property var workerRows: ({})
    function releaseWorker() { if(worker){worker.stop();worker.destroy();worker=null} workerRows = ({}) }
    function accumulateRows(rows) {
        var stored = Object.keys(workerRows).length
        for(var row of rows || []) if(row.url && stored<5000) { if(!workerRows[row.url])stored++; workerRows[row.url]=row }
        return Object.keys(workerRows).map(function(key){return app.workerRows[key]})
    }
    property bool intro: true
    property real entrance: 0
    property real effectPhase: 0
    property string smokeOutput: typeof SmokeOutput !== "undefined" ? SmokeOutput : ""

    function time(value) { var n = Math.max(0, Math.floor(value || 0)); return Math.floor(n / 60) + ":" + (n % 60 < 10 ? "0" : "") + n % 60 }
    function matches(words) { return !settingsSearch || words.toLowerCase().indexOf(settingsSearch.toLowerCase()) >= 0 }
    function choose(row, id) { var copy = Object.assign({}, choices); copy[String(row)] = id; choices = copy }
    function navigate(url) {
        if (Backend.allowed(music.url) && music.url.toString() !== "about:blank") {
            music.runJavaScript("(()=>{const a=document.createElement('a');a.href=" + JSON.stringify(url.toString()) + ";document.body.append(a);a.click();a.remove();})()")
        } else music.url = url
    }
    function openPopup(request) { var popup = popupFactory.createObject(app); popup.browser.acceptAsNewWindow(request); popup.show() }

    property var soundcloudProfile: SoundCloudProfile
    Component {
        id: popupFactory
        Window {
            id: popup
            property alias browser: authBrowser
            width: 520; height: 740; title: "Вход в SoundCloud"
            onClosing: destroy()
            WebEngineView {
                id: authBrowser
                anchors.fill: parent
                profile: soundcloudProfile
                settings.javascriptCanAccessClipboard: false
                settings.localContentCanAccessRemoteUrls: false
                onNavigationRequested: function(request) { if (!Backend.allowed(request.url, true) && request.url.toString() !== "about:blank") request.reject() }
                onNewWindowRequested: function(request) { app.openPopup(request) }
                onWindowCloseRequested: popup.close()
                onFeaturePermissionRequested: function(origin, feature) { grantFeaturePermission(origin, feature, false) }
            }
        }
    }
    Connections {
        target: Backend
        function onJavascriptRequested(script, ticket) { music.runJavaScript(script, function(result) { Backend.receive(ticket, result) }) }
        function onNavigationRequested(url) { app.navigate(url) }
        function onReloadRequested(url) { music.url=url; music.reload() }
        function onWorkerRequested(url, ticket) {
            app.releaseWorker()
            app.workerTicket = ticket; app.workerPasses = 0; app.workerStable = 0; app.workerCount = -1; app.workerReady = false
            app.workerRows = ({})
            app.worker = workerFactory.createObject(app)
            worker.url = url; workerDeadline.restart()
        }
        function onWorkerStopped() { app.workerTicket = ""; app.releaseWorker(); collectorTimer.stop(); workerDeadline.stop() }
    }
    Timer { interval: app.foreground ? 650 : 2500; running: !app.intro; repeat: true; onTriggered: Backend.poll() }
    Timer { interval: 80; running: (Backend.page === "lyrics" || !!Backend.track.playing) && app.foreground; repeat: true; onTriggered: app.playPosition = Backend.position }
    Timer {
        id: collectorTimer
        interval: 1000; repeat: true
        onTriggered: {
            if (!app.workerTicket || !app.workerReady) return
            var ticket = app.workerTicket
            worker.runJavaScript(Backend.collector, function(data) {
                if (ticket !== app.workerTicket) return
                app.workerPasses++
                var collected = app.accumulateRows(data ? data.rows : [])
                var count = collected.length
                app.workerStable = count === app.workerCount ? app.workerStable + 1 : 0
                app.workerCount = count
                if (data && (data.login || count >= (ticket.endsWith(":likes") ? 5000 : 40) || count > 0 && app.workerStable >= 3 || app.workerPasses >= 18)) {
                    app.workerTicket = ""; collectorTimer.stop(); workerDeadline.stop()
                    data.rows = collected; app.workerRows = ({}); app.releaseWorker(); Backend.workerResult(ticket, data)
                } else worker.runJavaScript("window.scrollTo(0,document.body.scrollHeight)")
            })
        }
    }
    Timer { id: workerDeadline; interval: 35000; onTriggered: { var t = app.workerTicket; app.workerTicket = ""; collectorTimer.stop(); app.releaseWorker(); Backend.workerError(t, "SoundCloud не ответил на запрос подборки") } }
    Component {
    id: workerFactory
    WebEngineView {
        id: workerView
        width: 1024; height: 768; x: -2000; y: -2000
        profile: soundcloudProfile
        settings.javascriptCanOpenWindows: false
        onNavigationRequested: function(request) { if (!Backend.allowed(request.url) && request.url.toString() !== "about:blank") request.action = WebEngineNavigationRequest.IgnoreRequest }
        onLoadingChanged: function(info) { if (info.status === WebEngineView.LoadSucceededStatus && app.workerTicket) { app.workerReady = true; collectorTimer.start() } }
        onFeaturePermissionRequested: function(origin, feature) { grantFeaturePermission(origin, feature, false) }
    }
    }

    Image { anchors.fill: parent; source: Backend.settings.background; fillMode: Image.PreserveAspectCrop; opacity: 0.12; visible: source.toString().length > 0; asynchronous: true }
    Loader {
        id: atmosphereLoader
        anchors.fill: parent
        active: Backend.settings.effect !== "none" && app.foreground && !app.intro
        sourceComponent: Atmosphere { anchors.fill: parent; kind: Backend.settings.effect === "ripples" ? "ripples" : "field"; cursorX: backgroundPointer.point.position.x; cursorY: backgroundPointer.point.position.y; motion: Backend.settings.motion }
    }


    Item {
    id: shell
    anchors.fill: parent
    RowLayout {
        anchors.fill: parent; anchors.margins: 12; anchors.bottomMargin: 112
        spacing: 0
        opacity: app.entrance
        Behavior on opacity { NumberAnimation { duration: Backend.settings.motion ? 500 : 0 } }
        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 68; radius: 20; border.color: Backend.colors.line; visible: Backend.settings.sidebar
            color: Backend.colors.surface
            Behavior on Layout.preferredWidth { NumberAnimation { duration: Backend.settings.motion ? 220 : 0; easing.type: Easing.OutCubic } }
            ColumnLayout {
                anchors.fill: parent; anchors.margins: 12
                spacing: 6
                RowLayout {
                    Layout.fillWidth: true; Layout.bottomMargin: 20; Layout.topMargin: 12
                    Image { source: Backend.settings.mode === "dark" ? "qrc:/native/assets/mark-light.svg" : "qrc:/native/assets/mark.svg"; sourceSize.width: 34; sourceSize.height: 34; Layout.preferredWidth: 34; Layout.preferredHeight: 34 }
                    Text { text: "HexSound"; visible: !app.compact; color: Backend.colors.ink; font.pixelSize: 21; font.weight: Font.DemiBold; Layout.leftMargin: 4 }
                }
                Repeater {
                    model: [{label:"Обзор", glyph:"discover", route:"discover"}, {label:"Моя волна", glyph:"wave", route:"wave"}, {label:"Любимые треки", glyph:"heart", route:"likes"}, {label:"Плейлисты", glyph:"list", route:"playlists"}, {label:"Моя лента", glyph:"feed", route:"feed"}, {label:"История", glyph:"history", route:"history"}]
                    delegate: HSButton {
                        required property var modelData
                        Layout.fillWidth: true; implicitHeight: 44; quiet: true
                        iconName: modelData.glyph; alignLeft: !app.compact; text: app.compact ? "" : modelData.label
                        selected: modelData.route === "wave" && Backend.page === "wave"
                        ToolTip.text: modelData.label
                        onClicked: modelData.route === "wave" ? Backend.show("wave") : Backend.navigate(modelData.route)
                    }
                }
                Item { Layout.fillHeight: true }
                HSButton { iconName: "settings"; alignLeft: !app.compact; text: app.compact ? "" : "Настройки"; Layout.fillWidth: true; quiet: true; selected: Backend.page === "settings"; ToolTip.text: "Настройки"; onClicked: Backend.show("settings") }
                Rectangle { Layout.fillWidth: true; height: 1; color: Backend.colors.line; Layout.topMargin: 10; Layout.bottomMargin: 10 }
                HSButton { iconName: "user"; alignLeft: !app.compact; text: app.compact ? "" : Backend.profile.name || "Войти в SoundCloud"; Layout.fillWidth: true; quiet: true; ToolTip.text: Backend.profile.name || "Вход в SoundCloud"; onClicked: Backend.navigate(Backend.profile.url || "login") }
            }
        }
        ColumnLayout {
            Layout.fillWidth: true; Layout.fillHeight: true; spacing: 0
            RowLayout {
                Layout.fillWidth: true; Layout.margins: 16; spacing: 12
                HSButton { iconName: "menu"; quiet: true; ToolTip.text: "Свернуть боковую панель"; onClicked: Backend.configure("sidebar", !Backend.settings.sidebar) }
                HSButton { iconName: "back"; quiet: true; ToolTip.text: "Назад"; onClicked: { if (Backend.page !== "music") Backend.show("music"); else music.goBack() } }
                HSField {
                    id: search
                    Layout.fillWidth: true; Layout.maximumWidth: 500; implicitHeight: 42
                    placeholderText: "Поиск музыки и исполнителей"; selectByMouse: true
                    leftPadding: 16; font.pixelSize: 14
                    background: Rectangle { radius: 10; color: Backend.colors.surface; border.color: search.activeFocus ? Backend.colors.accent : Backend.colors.line }
                    onAccepted: { Backend.search(text); focus = false }
                }
                Item { Layout.fillWidth: true }
                HSButton { text: Backend.updateReady ? "Перезапустить" : Backend.updateAvailable ? "Обновить" : Backend.updateStatus; visible: Backend.updateAvailable || Backend.updateReady || Backend.updateStatus.startsWith("Загрузка"); primary: true; enabled: Backend.updateAvailable || Backend.updateReady; onClicked: Backend.updateReady ? Backend.installUpdate() : Backend.downloadUpdate() }
                HSButton { text: "Текст песни"; quiet: true; selected: Backend.page === "lyrics"; onClicked: Backend.openLyrics() }
            }
            Item {
                id: content
                Layout.fillWidth: true; Layout.fillHeight: true; clip: true
                property string activePage: Backend.page
                onActivePageChanged: pageEntrance.restart()
                NumberAnimation { id: pageEntrance; target: content; property: "opacity"; from: 0; to: 1; duration: Backend.settings.motion ? 260 : 0; easing.type: Easing.OutCubic }
                WebEngineView {
                    id: music
                    objectName: "soundcloudView"
                    anchors.fill: parent
                    visible: Backend.page === "music"
                    profile: soundcloudProfile
                    url: app.smokeOutput ? "about:blank" : "https://soundcloud.com/discover"
                    backgroundColor: Backend.settings.effect === "none" ? Backend.colors.bg : "transparent"
                    zoomFactor: Backend.settings.scale / 100
                    settings.playbackRequiresUserGesture: false
                    settings.javascriptCanAccessClipboard: false
                    settings.localContentCanAccessRemoteUrls: false
                    onNavigationRequested: function(request) { if (!Backend.allowed(request.url) && request.url.toString() !== "about:blank" && !(app.smokeOutput && request.url.toString().startsWith("data:text/html"))) request.reject() }
                    onNewWindowRequested: function(request) { app.openPopup(request) }
                    onLoadingChanged: function(info) { if(app.smokeOutput && info.status === WebEngineView.LoadFailedStatus)Harness.check(false,"Fixture failed to load: "+info.errorString); if (info.status === WebEngineView.LoadSucceededStatus && Backend.allowed(url)) runJavaScript(Backend.injection()); else if(info.status === WebEngineView.LoadFailedStatus && Backend.allowed(url)) Backend.notify("SoundCloud не загрузился. Проверьте соединение и нажмите «Обзор»") }
                    onFeaturePermissionRequested: function(origin, feature) { grantFeaturePermission(origin, feature, false) }
                    onRenderProcessTerminated: function(status, code) { if(app.smokeOutput)Harness.check(false,"WebEngine renderer terminated: "+status+" / "+code); Backend.notify("Страница SoundCloud остановилась. Откройте «Обзор» повторно") }
                }

                ScrollView {
                    anchors.fill: parent; visible: Backend.page === "wave"; clip: true
                    contentWidth: availableWidth
                    ColumnLayout {
                        width: parent.width; spacing: 24
                        Item { Layout.preferredHeight: 24 }
                        Text { text: "Музыка в вашем ритме"; color: Backend.colors.muted; font.pixelSize: 14; Layout.alignment: Qt.AlignHCenter }
                        Text { text: "Моя волна"; color: Backend.colors.ink; font.pixelSize: app.width < 1000 ? 48 : 64; font.weight: Font.DemiBold; font.letterSpacing: -2; Layout.alignment: Qt.AlignHCenter }
                        Item {
                            Layout.preferredWidth: 240; Layout.preferredHeight: 160; Layout.alignment: Qt.AlignHCenter
                            Repeater {
                                model: 23
                                Rectangle { required property int index; width: 5; radius: 3; color: Backend.colors.accent; x: index * 10; anchors.verticalCenter: parent.verticalCenter; height: 18 + Math.abs(Math.sin(index*.57+app.effectPhase))*105
                                    Behavior on height { NumberAnimation { duration: Backend.settings.motion ? 280 : 0 } }
                                }
                            }
                        }
                        Text { text: "Ваши лайки и находки по любимым исполнителям"; color: Backend.colors.muted; font.pixelSize: 14; Layout.alignment: Qt.AlignHCenter; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; Layout.maximumWidth: content.width - 60 }
                        RowLayout {
                            Layout.alignment: Qt.AlignHCenter; spacing: 12
                            HSButton { text: Backend.radio && Backend.track.playing ? "Ⅱ  Пауза" : "▶  Включить волну"; primary: true; implicitHeight: 48; implicitWidth: 200; onClicked: Backend.startWave() }
                            HSButton { text: "Настроить"; implicitHeight: 48; onClicked: waveOptions.open() }
                        }
                        RowLayout { Layout.alignment: Qt.AlignHCenter; visible: Backend.radio
                            HSButton { text: "♡ Нравится"; quiet: true; onClicked: Backend.feedback("like") }
                            HSButton { text: "Не предлагать"; quiet: true; onClicked: Backend.feedback("dislike") }
                            HSButton { text: "Следующий →"; quiet: true; onClicked: Backend.feedback("skip") }
                        }
                        Text { text: Backend.busy ? "Подбираем музыку…" : Backend.wave.length ? "В подборке" : "Войдите в SoundCloud и добавьте любимые треки — они станут основой волны."; color: Backend.colors.muted; font.pixelSize: 13; Layout.leftMargin: 32; Layout.rightMargin: 32; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.topMargin: 16 }
                        Repeater {
                            model: Backend.wave
                            delegate: ItemDelegate {
                                required property var modelData
                                required property int index
                                Layout.fillWidth: true; Layout.leftMargin: 24; Layout.rightMargin: 24; implicitHeight: 64
                                background: Rectangle { radius: 10; color: parent.hovered ? Backend.colors.surface : "transparent" }
                                contentItem: RowLayout {
                                    spacing: 16
                                    Text { text: String(index+1).padStart(2,"0"); color: Backend.colors.muted; font.pixelSize: 12; Layout.preferredWidth: 24 }
                                    Image { source: modelData.artwork || ""; Layout.preferredWidth: 44; Layout.preferredHeight: 44; fillMode: Image.PreserveAspectCrop; asynchronous: true }
                                    ColumnLayout { Layout.fillWidth: true; spacing: 4
                                        Text { text: modelData.title || ""; color: Backend.colors.ink; font.pixelSize: 14; elide: Text.ElideRight; Layout.fillWidth: true }
                                        Text { text: modelData.artist || ""; color: Backend.colors.muted; font.pixelSize: 12; elide: Text.ElideRight; Layout.fillWidth: true }
                                    }
                                    Text { text: modelData.reason || ""; visible: app.width > 1050; color: Backend.colors.muted; font.pixelSize: 12 }
                                    Text { text: "▶"; color: Backend.colors.ink }
                                }
                                onClicked: Backend.playWave(index)
                            }
                        }
                        Item { Layout.preferredHeight: 32 }
                    }
                }

                RowLayout {
                    anchors.fill: parent; anchors.margins: app.width > 1000 ? 40 : 20
                    visible: Backend.page === "lyrics"; spacing: 48
                    ColumnLayout {
                        Layout.preferredWidth: Math.min(content.width * .36, 340); Layout.alignment: Qt.AlignVCenter; spacing: 18
                        Rectangle {
                            Layout.fillWidth: true; Layout.preferredHeight: width; radius: 18; color: Backend.colors.raised; clip: true
                            Image { anchors.fill: parent; source: Backend.track.artwork || ""; fillMode: Image.PreserveAspectCrop; asynchronous: true; rotation: Backend.settings.artworkTilt && coverMouse.containsMouse ? (coverMouse.mouseX / width - .5)*6 : 0
                                Behavior on rotation { NumberAnimation { duration: 300; easing.type: Easing.OutCubic } }
                            }
                            MouseArea { id: coverMouse; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
                        }
                        Text { text: Backend.track.title || "Выберите музыку"; color: Backend.colors.ink; font.pixelSize: 24; font.weight: Font.DemiBold; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        Text { text: Backend.track.artist || ""; color: Backend.colors.muted; font.pixelSize: 16; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        RowLayout { Layout.alignment: Qt.AlignHCenter
                            HSButton { iconName: "previous"; quiet: true; onClicked: Backend.control("previous") }
                            HSButton { iconName: Backend.track.playing ? "pause" : "play"; primary: true; implicitWidth: 56; implicitHeight: 56; onClicked: Backend.control("toggle") }
                            HSButton { iconName: "next"; quiet: true; onClicked: Backend.control("next") }
                        }
                        HSButton { text: "Открыть LRC"; quiet: true; Layout.alignment: Qt.AlignHCenter; onClicked: Backend.importLyrics() }
                    }
                    Item {
                        Layout.fillWidth: true; Layout.fillHeight: true
                        ListView {
                            id: lyricList
                            anchors.fill: parent; clip: true; spacing: 22
                            topMargin: height*.25; bottomMargin: height*.4
                            model: Backend.lyrics
                            property int activeLine: {
                                var active = -1
                                for(var i=0;i<Backend.lyrics.length;i++){var t=Backend.lyrics[i].time;if(t>=0&&t<=app.playPosition)active=i;else if(t>app.playPosition)break}
                                return active
                            }
                            onActiveLineChanged: if(activeLine>=0&&!moving) positionViewAtIndex(activeLine,ListView.Center)
                            Behavior on contentY { enabled: Backend.settings.motion && !lyricList.dragging && !lyricList.flicking; NumberAnimation { duration: 440; easing.type: Easing.OutCubic } }
                            highlightMoveDuration: Backend.settings.motion ? 400 : 0
                            delegate: Item {
                                required property var modelData
                                required property int index
                                width: lyricList.width; height: lyricWords.implicitHeight + 8
                                opacity: lyricList.activeLine === index || modelData.time < 0 ? 1 : index < lyricList.activeLine ? .3 : .5
                                Behavior on opacity { NumberAnimation { duration: Backend.settings.motion ? 320 : 0 } }
                                Text { id: lyricWords; width: parent.width - 12; text: modelData.text; color: Backend.colors.ink; font.pixelSize: content.width > 900 ? 36 : 26; font.weight: Font.DemiBold; wrapMode: Text.Wrap; lineHeight: 1.15; y: lyricList.activeLine === index ? 0 : 5
                                    Behavior on y { NumberAnimation { duration: Backend.settings.motion ? 360 : 0; easing.type: Easing.OutCubic } }
                                }
                                MouseArea { anchors.fill: parent; cursorShape: modelData.time >= 0 ? Qt.PointingHandCursor : Qt.ArrowCursor; onClicked: if(modelData.time>=0) Backend.control("seek",modelData.time) }
                            }
                            ScrollBar.vertical: ScrollBar {}
                        }
                        Text { anchors.centerIn: parent; width: parent.width; text: Backend.lyricStatus; visible: Backend.lyrics.length === 0; color: Backend.colors.muted; font.pixelSize: 18; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap }
                    }
                }

                ScrollView {
                    anchors.fill: parent; clip: true; contentWidth: availableWidth
                    visible: Backend.page === "settings"
                    ColumnLayout {
                        width: Math.min(content.width-48,900); x: (content.width-width)/2; spacing: 20
                        Item { Layout.preferredHeight: 16 }
                        Text { text: "Под себя"; color: Backend.colors.ink; font.pixelSize: 44; font.weight: Font.DemiBold; font.letterSpacing: -1.5 }
                        Text { text: "Ваш звук. Ваше пространство."; color: Backend.colors.muted; font.pixelSize: 15 }
                        Flow { Layout.fillWidth: true; spacing: 8
                            Repeater { model: ["Внешний вид","Прослушивание","Аккаунт","Перенос","Приложение"]
                                delegate: HSButton { required property string modelData; required property int index; text: modelData; selected: app.section===index; onClicked: {app.section=index;settingsSearchField.clear()} }
                            }
                        }
                            HSField { id: settingsSearchField; Layout.fillWidth: true; placeholderText: "Поиск по всем настройкам"; selectByMouse: true; implicitHeight: 42; onTextChanged: app.settingsSearch = text }
                            ColumnLayout {
                                visible: app.section === 0 || !!app.settingsSearch; Layout.fillWidth: true; spacing: 24
                                Setting { title: "Режим"; description: "Светлое или тёмное оформление"; visible: app.matches("режим светлая темная тема")
                                    HSButton { text: "Светлый"; selected: Backend.settings.mode === "light"; onClicked: Backend.configure("mode","light") }
                                    HSButton { text: "Тёмный"; selected: Backend.settings.mode === "dark"; onClicked: Backend.configure("mode","dark") }
                                }
                                Setting { title: "Цветовая палитра"; description: "32 сочетания цвета для светлого и тёмного режима"; visible: app.matches("палитра темы цвет")
                                    Rectangle { width: 8; height: 32; radius: 4; color: Backend.colors.accent }
                                    HSSelect { implicitWidth: 180; model: Backend.palettes; textRole: "name"; currentIndex: {for(var i=0;i<Backend.palettes.length;i++)if(Backend.palettes[i].id===Backend.settings.theme)return i;return 0}
                                    onActivated: function(index){var p=Backend.palettes[index];Backend.configure("mode",p.mode);Backend.configure("theme",p.id)} }
                                }
                                Setting { title: "Движение"; description: "Плавные переходы, анимации текста и фона"; visible: app.matches("движение анимации")
                                    HSSwitch { checked: Backend.settings.motion; onToggled: Backend.configure("motion",checked) }
                                }
                                Setting { title: "Эффект фона"; description: "Работает на экранах волны, текста и настроек"; visible: app.matches("эффект фон")
                                    HSSelect { model: ["Без анимации","Световое поле","Волны курсора"]; property var keys: ["none","field","ripples"]; currentIndex: keys.indexOf(Backend.settings.effect); onActivated: Backend.configure("effect",keys[currentIndex]); implicitWidth: 160 }
                                }
                                Setting { title: "Изображение фона"; visible: app.matches("изображение фон обои")
                                    HSButton { text: "Выбрать"; onClicked: Backend.chooseBackground() }
                                    HSButton { text: "Убрать"; enabled: !!Backend.settings.background; onClicked: Backend.configure("background","") }
                                }
                                Setting { title: "Масштаб каталога"; visible: app.matches("масштаб размер")
                                    HSSelect { model: ["85%","100%","110%","125%"]; property var values: [85,100,110,125]; currentIndex: values.indexOf(Backend.settings.scale); onActivated: Backend.configure("scale",values[currentIndex]) }
                                }
                                Setting { title: "Показывать навигацию"; visible: app.matches("боковая панель")
                                    HSSwitch { checked: Backend.settings.sidebar; onToggled: Backend.configure("sidebar",checked) }
                                }
                                Setting { title: "Комментарии в каталоге"; visible: app.matches("комментарии")
                                    HSSwitch { checked: Backend.settings.comments; onToggled: Backend.configure("comments",checked) }
                                }
                                Setting { title: "Рекомендации в каталоге"; visible: app.matches("рекомендации")
                                    HSSwitch { checked: Backend.settings.recommendations; onToggled: Backend.configure("recommendations",checked) }
                                }
                                Setting { title: "Счётчики треков"; visible: app.matches("счетчики статистика")
                                    HSSwitch { checked: Backend.settings.stats; onToggled: Backend.configure("stats",checked) }
                                }
                            }
                            ColumnLayout {
                                visible: app.section === 1 || !!app.settingsSearch; Layout.fillWidth: true; spacing: 24
                                Setting { title: "Громкость"; visible: app.matches("громкость звук")
                                    HSSlider { from: 0; to: 1; value: Backend.volume; implicitWidth: 130; onMoved: Backend.control("volume",value) }
                                    Text { text: Math.round(Backend.volume*100)+"%"; color: Backend.colors.muted; Layout.preferredWidth: 36 }
                                }
                                Setting { title: "Поиск текста"; description: "Текст песни из LRCLIB. Локальные LRC доступны всегда."; visible: app.matches("поиск текст песни lrclib")
                                    HSSwitch { checked: Backend.settings.lyricsOnline; onToggled: Backend.configure("lyricsOnline",checked) }
                                }
                                Setting { title: "Наклон обложки"; description: "Лёгкое движение при наведении в полноэкранном плеере"; visible: app.matches("наклон обложки анимации")
                                    HSSwitch { checked: Backend.settings.artworkTilt; onToggled: Backend.configure("artworkTilt",checked) }
                                }
                                Setting { title: "Моя волна"; description: "Баланс знакомой музыки и находок, настроение подборки"; visible: app.matches("моя волна настроение подборка")
                                    HSButton { text: "Настроить"; onClicked: waveOptions.open() }
                                }
                            }
                            ColumnLayout {
                                visible: (app.section === 2 || !!app.settingsSearch) && app.matches("аккаунт вход soundcloud api токен доступ client"); Layout.fillWidth: true; spacing: 24
                                Setting { title: "Аккаунт для прослушивания"; description: Backend.profile.name || "Войдите прямо в приложении — API-ключи для музыки не нужны"; visible: app.matches("аккаунт вход soundcloud")
                                    HSButton { text: Backend.profile.name ? "Профиль" : "Войти"; primary: true; onClicked: Backend.navigate(Backend.profile.url || "login") }
                                    HSButton { text: "Выйти"; visible: !!Backend.profile.loggedIn; onClicked: Backend.logout() }
                                }
                                Text { text: "Доступ для переноса"; color: Backend.colors.ink; font.pixelSize: 22; font.weight: Font.DemiBold }
                                Text { text: "Для создания плейлиста нужен SoundCloud API. Обычный вход и разрешение на запись подключаются отдельно. Зарегистрируйте собственное приложение и укажите redirect URI: http://127.0.0.1:8766/callback/soundcloud"; color: Backend.colors.muted; font.pixelSize: 13; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Text { text: Backend.apiStatus || "API не подключён"; color: Backend.colors.ink; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                HSField { id: clientId; placeholderText: "Client ID"; Layout.fillWidth: true; selectByMouse: true }
                                HSField { id: clientSecret; placeholderText: "Client Secret"; echoMode: TextInput.Password; Layout.fillWidth: true; selectByMouse: true }
                                HSButton { text: "Разрешить доступ SoundCloud"; enabled: !Backend.busy; onClicked: { Backend.connectApi(clientId.text,clientSecret.text); clientSecret.clear() } }
                                Text { text: "Или используйте свой API access token"; color: Backend.colors.muted; font.pixelSize: 12 }
                                HSField { id: accessToken; placeholderText: "Access token"; echoMode: TextInput.Password; Layout.fillWidth: true; selectByMouse: true }
                                RowLayout {
                                    HSButton { text: "Подключить токен"; enabled: accessToken.text.length > 0 && !Backend.busy; onClicked: { Backend.tokenApi(accessToken.text); accessToken.clear() } }
                                    HSButton { text: "Отключить API"; enabled: Backend.apiConnected; onClicked: Backend.disconnectApi() }
                                }
                                Text { text: Qt.platform.os === "windows" ? "API-секреты защищены системным хранилищем Windows." : "API-секреты хранятся только в памяти до закрытия приложения."; color: Backend.colors.muted; font.pixelSize: 12; wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                            ColumnLayout {
                                visible: (app.section === 3 || !!app.settingsSearch) && app.matches("импорт файл csv tsv json перенос плейлист"); Layout.fillWidth: true; spacing: 18
                                Text { text: "Из файла — в SoundCloud"; color: Backend.colors.ink; font.pixelSize: 24; font.weight: Font.DemiBold }
                                Text { text: "CSV, TSV или JSON со списком треков. Мы найдём записи, вы проверите совпадения, затем создадим новый приватный плейлист. Аудиофайлы не загружаются."; color: Backend.colors.muted; font.pixelSize: 13; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                RowLayout { Layout.fillWidth: true
                                    HSButton { text: "Выбрать файл"; onClicked: { Backend.importMusic(); app.choices = ({}) } }
                                    HSButton { text: "Найти совпадения"; enabled: Backend.imports.length > 0 && Backend.apiConnected && !Backend.busy; primary: true; onClicked: { app.choices = ({}); Backend.previewImport() } }
                                }
                                Text { text: "Записей: " + Backend.imports.length + " · " + (Backend.apiStatus || "Подключите API в разделе SoundCloud"); color: Backend.colors.muted; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Repeater { model: Backend.review
                                    delegate: ColumnLayout {
                                        id: importRow
                                        required property var modelData
                                        required property int index
                                        Layout.fillWidth: true; spacing: 8
                                        Text { text: modelData.source.artist + " — " + modelData.source.title; color: Backend.colors.ink; font.pixelSize: 14; elide: Text.ElideRight; Layout.fillWidth: true }
                                        HSSelect {
                                            Layout.fillWidth: true; textRole: "label"; valueRole: "id"
                                            model: { var rows=[{label:"Пропустить",id:""}]; for(var c of modelData.candidates)rows.push({label:c.artist+" — "+c.title+" · "+Math.round(c.score*100)+"%",id:c.id}); return rows }
                                            currentIndex: { var id=app.choices[String(index)] !== undefined ? app.choices[String(index)] : modelData.selected; for(var i=0;i<model.length;i++)if(model[i].id===id)return i;return 0 }
                                            onActivated: function(selectedIndex) { app.choose(importRow.index,currentValue) }
                                        }
                                    }
                                }
                                HSField { id: playlistName; Layout.fillWidth: true; placeholderText: "Название нового плейлиста"; text: "Мой импорт" }
                                RowLayout {
                                    HSButton { text: "Создать плейлист"; primary: true; enabled: Backend.review.length > 0 && !Backend.busy && playlistName.text.trim().length > 0; onClicked: Backend.commitImport(playlistName.text,app.choices) }
                                    HSButton { text: "Продолжить перенос"; enabled: Backend.apiConnected && !Backend.busy; onClicked: Backend.resumeImport() }
                                    HSButton { text: "Отменить"; visible: Backend.busy; onClicked: Backend.cancel() }
                                }
                            }
                            ColumnLayout {
                                visible: (app.section === 4 || !!app.settingsSearch) && app.matches("обновления версия github changelog изменения discord rpc статус application id"); Layout.fillWidth: true; spacing: 24
                                Setting { title: "Discord Rich Presence"; description: "Показывать текущую музыку в профиле Discord"
                                    HSSwitch { checked: Backend.settings.discordEnabled; onToggled: Backend.configure("discordEnabled",checked) }
                                }
                                HSField { Layout.fillWidth: true; placeholderText: "Application ID Discord"; text: Backend.settings.discordApplication; onEditingFinished: Backend.configure("discordApplication",text) }
                                Text { text: Backend.rpcStatus; color: Backend.colors.muted; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Text { text: "Нужен публичный ID вашего Discord-приложения. Bot token и пароль не требуются."; color: Backend.colors.muted; font.pixelSize: 12; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Text { text: "HexSound " + Backend.version; color: Backend.colors.ink; font.pixelSize: 28; font.weight: Font.DemiBold }
                                Text { text: "Обновления приходят из GitHub. Приложение загрузит архив, проверит его и заменит файлы после перезапуска. Установщик не запускается."; color: Backend.colors.muted; font.pixelSize: 13; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Text { text: Backend.updateStatus || "Проверить новую версию"; color: Backend.colors.ink; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                RowLayout {
                                    HSButton { text: "Проверить"; onClicked: Backend.checkUpdates() }
                                    HSButton { text: "Скачать"; enabled: Backend.updateAvailable; primary: true; onClicked: Backend.downloadUpdate() }
                                    HSButton { text: "Установить"; enabled: Backend.updateReady; onClicked: Backend.installUpdate() }
                                }
                                Text { text: Backend.releaseNotes; color: Backend.colors.muted; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true; font.pixelSize: 13; lineHeight: 1.5 }
                            }

                        Item { Layout.preferredHeight: 40 }
                    }
                }
            }
        }
    }

    Rectangle {
        id: dock
        anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 12
        height: 88; radius: 20; border.color: Backend.colors.line; color: Backend.colors.surface; opacity: app.entrance

        RowLayout {
            anchors.fill: parent; anchors.margins: 18; spacing: 16
            Rectangle { Layout.preferredWidth: 56; Layout.preferredHeight: 56; radius: 8; color: Backend.colors.raised; clip: true
                Image { anchors.fill: parent; source: Backend.track.artwork || ""; fillMode: Image.PreserveAspectCrop; asynchronous: true }
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Backend.openLyrics() }
            }
            ColumnLayout {
                Layout.preferredWidth: app.width > 1100 ? 220 : 138; spacing: 5
                Text { text: Backend.track.title || "Выберите трек"; color: Backend.colors.ink; font.pixelSize: 14; elide: Text.ElideRight; Layout.fillWidth: true }
                Text { text: Backend.track.artist || "SoundCloud"; color: Backend.colors.muted; font.pixelSize: 12; elide: Text.ElideRight; Layout.fillWidth: true }
            }
            HSButton { iconName: "heart"; selected: !!Backend.track.liked; quiet: true; visible: app.width > 1000; onClicked: Backend.control("like"); ToolTip.text: "Нравится" }
            ColumnLayout {
                Layout.fillWidth: true; Layout.maximumWidth: 700; spacing: 0
                RowLayout { Layout.alignment: Qt.AlignHCenter; spacing: 12
                    HSButton { iconName: "shuffle"; quiet: true; selected: !!Backend.track.shuffle; visible: app.width > 1000; onClicked: Backend.control("shuffle"); ToolTip.text: "Перемешать" }
                    HSButton { iconName: "previous"; quiet: true; onClicked: Backend.control("previous"); ToolTip.text: "Предыдущий" }
                    HSButton { iconName: Backend.track.playing ? "pause" : "play"; primary: true; implicitWidth: 42; implicitHeight: 42; onClicked: Backend.control("toggle"); ToolTip.text: "Воспроизведение / пауза" }
                    HSButton { iconName: "next"; quiet: true; onClicked: Backend.control("next"); ToolTip.text: "Следующий" }
                    HSButton { iconName: "repeat"; quiet: true; selected: !!Backend.track.repeat && Backend.track.repeat !== "off"; visible: app.width > 1000; onClicked: Backend.control("repeat"); ToolTip.text: "Повтор" }
                }
                RowLayout { Layout.fillWidth: true; spacing: 10
                    Text { text: app.time(seek.pressed ? seek.value : app.playPosition); color: Backend.colors.muted; font.pixelSize: 10; Layout.preferredWidth: 34 }
                    HSSlider { id: seek; Layout.fillWidth: true; from: 0; to: Backend.track.duration || 1; value: app.playPosition; enabled: !!Backend.track.seekable; onMoved: Backend.control("seek",value); implicitHeight: 22 }
                    Text { text: app.time(Backend.track.duration); color: Backend.colors.muted; font.pixelSize: 10; Layout.preferredWidth: 34 }
                }
            }
            Item { Layout.fillWidth: true; visible: app.width > 1300 }
            HSButton { iconName: "lyrics"; quiet: true; onClicked: Backend.openLyrics(); ToolTip.text: "Полный плеер и текст" }
            HSIcon { name: "volume"; ink: Backend.colors.muted; visible: app.width > 900 }
            HSSlider { id: loudness; Layout.preferredWidth: app.width > 1100 ? 100 : 68; from: 0; to: 1; value: Backend.volume; onMoved: Backend.control("volume",value); ToolTip.visible: hovered || pressed; ToolTip.text: Math.round(value*100)+"%" }
        }
    }
    }
    MultiEffect {
        anchors.fill: shell
        source: shell
        visible: app.intro
        blurEnabled: visible
        blur: 0.65
        blurMax: 32
    }
    Timer { interval: 120; running: Backend.page === "wave" && !!Backend.track.playing && Backend.settings.motion && app.visible; repeat: true; onTriggered: app.effectPhase += .09 }
    Popup {
        id: waveOptions
        anchors.centerIn: parent; width: Math.min(460,app.width - 60); padding: 28; modal: true; dim: true; closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: Rectangle { color: Backend.colors.surface; radius: 18; border.color: Backend.colors.line }
        contentItem: ColumnLayout {
            spacing: 22
            Text { text: "Настроить волну"; color: Backend.colors.ink; font.pixelSize: 24; font.weight: Font.DemiBold }
            Setting { title: "Характер"; description: "Что искать в следующей подборке"
                HSSelect { model: ["Баланс","Знакомое","Открытия"]; property var keys: ["balanced","familiar","discover"]; currentIndex: keys.indexOf(Backend.settings.novelty); onActivated: Backend.configure("novelty",keys[currentIndex]) }
            }
            Setting { title: "Настроение"
                HSSelect { model: ["Любое","Спокойное","Энергичное","Для фокуса"]; property var keys: ["any","calm","energy","focus"]; currentIndex: keys.indexOf(Backend.settings.mood); onActivated: Backend.configure("mood",keys[currentIndex]) }
            }
            Text { text: "Подборка строится по лайкам и поиску SoundCloud. Оценки треков сохраняются на этом устройстве."; color: Backend.colors.muted; wrapMode: Text.Wrap; Layout.fillWidth: true; font.pixelSize: 12 }
            HSButton { text: "Начать новую подборку"; primary: true; Layout.fillWidth: true; onClicked: { Backend.stopWave(); Backend.startWave(); waveOptions.close() } }
        }
    }
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; anchors.bottomMargin: 118
        width: Math.min(app.width-80,noticeText.implicitWidth+40); height: noticeText.implicitHeight+28; radius: 12
        color: Backend.colors.raised; border.color: Backend.colors.line; visible: Backend.status.length > 0
        Text { id: noticeText; anchors.centerIn: parent; width: Math.min(implicitWidth,app.width-120); text: Backend.status; color: Backend.colors.ink; font.pixelSize: 13; wrapMode: Text.Wrap }
    }
    Rectangle {
        id: splash
        anchors.fill: parent; color: Qt.alpha(Backend.colors.bg,.88); visible: app.intro
        Row { anchors.centerIn: parent; spacing: 18
            Image { source: Backend.settings.mode === "dark" ? "qrc:/native/assets/mark-light.svg" : "qrc:/native/assets/mark.svg"; width: 52; height: 52 }
            Text { text: "HexSound"; color: Backend.colors.ink; font.pixelSize: 36; font.weight: Font.DemiBold; opacity: app.entrance; width: app.entrance * implicitWidth; clip: true
                Behavior on width { NumberAnimation { duration: Backend.settings.motion ? 650 : 0; easing.type: Easing.OutCubic } }
            }
        }
        Timer { interval: 140; running: true; onTriggered: app.entrance = 1 }
        Timer { interval: Backend.settings.motion ? 1050 : 150; running: true; onTriggered: { app.intro = false; if(!app.smokeOutput)Backend.checkUpdates() } }
    }
    Shortcut { sequence: "Ctrl+,"; onActivated: Backend.show("settings") }
    Shortcut { sequence: "Ctrl+L"; onActivated: search.forceActiveFocus() }
    Shortcut { sequence: "Escape"; onActivated: { if(Backend.page === "lyrics" || Backend.page === "settings") Backend.show("music") } }
    Timer {
        id: smokeTimer
        interval: 1200; running: !!app.smokeOutput; repeat: true
        property int step: 0
        onTriggered: {
            step++
            if(step===1){Backend.show("settings");Harness.check(Backend.palettes.length===32,"32 palettes loaded");app.accumulateRows([{url:"https://soundcloud.com/test/first"}]);Harness.check(app.accumulateRows([{url:"https://soundcloud.com/test/second"}]).length===2,"Virtualized lists retain earlier rows");app.workerRows=({})}
            else if(step===2){Harness.capture("settings-dark");app.width=800;app.height=640;app.section=1}
            else if(step===3){Harness.capture("settings-compact");Backend.configure("mode","light");Backend.configure("theme","studio");Backend.configure("effect","field");app.width=1320;app.height=860;Backend.show("wave");Harness.movePointer(300,300)}
            else if(step===4){Harness.check(Math.abs(backgroundPointer.point.position.x-300)<2,"Background follows pointer input");Harness.capture("wave-light");Backend.configure("mode","dark");Backend.configure("theme","obsidian");Backend.configure("effect","ripples");Backend.show("lyrics")}
            else if(step===5){Harness.capture("lyrics-empty");Backend.show("music");
                music.loadHtml("<html><body><audio id='a' src='"+Harness.audioData()+"'></audio><button class='playControls__play' onclick=\"const a=document.querySelector('audio');a.paused?a.play():a.pause()\">Play</button><div class='playbackSoundBadge'><a class='playbackSoundBadge__titleLink' href='https://soundcloud.com/test/audio'>Native WAV check</a><a class='playbackSoundBadge__lightLink'>Test</a></div><script>document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();history.pushState({},'',a.href)}})</script></body></html>","https://soundcloud.com/fixture")
            }
            else if(step===6){music.runJavaScript(Backend.injection(),function(){Backend.control("toggle")})}
            else if(step===7){Backend.poll();Backend.show("wave");music.runJavaScript("!document.querySelector('audio').paused && document.querySelector('audio').currentTime>0",function(ok){Harness.check(ok,"Native control starts real audio")});Backend.control("volume",.27)}
            else if(step===8){music.runJavaScript("Math.abs(document.querySelector('audio').volume-.27)<.01",function(ok){Harness.check(ok,"Native volume controls audio")});Backend.control("toggle")}
            else if(step===9){music.runJavaScript("document.querySelector('audio').paused",function(ok){Harness.check(ok,"Native control pauses audio");Harness.check(Backend.track.title==="Native WAV check","Bridge reports real track")});Backend.navigate("https://soundcloud.com/test/second");Backend.configure("effect","field")}
            else if(step===10){music.runJavaScript("location.pathname==='/test/second' && !!document.querySelector('audio')",function(ok){Harness.check(ok,"SPA navigation keeps the same audio page")});Backend.show("settings");app.section=0;Backend.configure("effect","ripples")}
            else if(step===11){Backend.configure("effect","field");app.width=800;app.height=640;app.section=3}
            else if(step===12){Harness.capture("import-compact");Backend.configure("effect","none");smokeTimer.stop();Harness.finish()}
        }
    }
}
