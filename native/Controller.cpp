#include "Controller.h"
#include "MusicData.h"
#include <QDesktopServices>
#include <QFileDialog>
#include <QProcess>
#include <algorithm>
namespace {
QString scriptFile(QString name) {
    QFile f(name);
    if (!f.open(QIODevice::ReadOnly))
        return {};
    return QString::fromUtf8(f.readAll());
}
QString js(QVariant v) {
    return QString::fromUtf8(QJsonDocument::fromVariant(QVariantList{v}).toJson(QJsonDocument::Compact))
        .mid(1)
        .chopped(1);
}
QString field(QVariantMap m, QString k) {
    return m[k].toString().left(1000);
}
bool updateHost(QUrl u) {
    return u.scheme() == "https" && u.userInfo().isEmpty() &&
           QStringList{"api.github.com", "github.com", "release-assets.githubusercontent.com",
                       "objects.githubusercontent.com"}
               .contains(u.host());
}
} // namespace
Controller::Controller(QString directory, QObject *p)
    : QObject(p), dir(directory.isEmpty() ? QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
                                          : directory),
      api(dir, this) {
    connect(&discord,&DiscordPresence::changed,this,&Controller::changed);
    config = MusicData::load(dir + "/preferences.json").toMap();
    QVariantMap defaults{{"theme", "obsidian"},     {"mode", "dark"},   {"motion", true},
                         {"artworkTilt", true},     {"sidebar", true},  {"scale", 100},
                         {"effect", "none"},        {"background", ""}, {"comments", true},
                         {"recommendations", true}, {"stats", true},    {"lyricsOnline", true},
                         {"novelty", "balanced"},   {"mood", "any"},    {"volume", 1.0}, {"discordEnabled",false}, {"discordApplication",""}};
    for (auto i = defaults.begin(); i != defaults.end(); ++i)
        if (!config.contains(i.key()))
            config[i.key()] = i.value();
    if(!QStringList{"none","field","ripples"}.contains(config["effect"].toString()))config["effect"]="field";
    themes =
        QJsonDocument::fromJson(scriptFile(":/native/assets/palettes.json").toUtf8()).toVariant().toList();
    ratings = MusicData::load(dir + "/feedback.json").toMap();
    imported = MusicData::load(dir + "/imports.json").toList();
    soundVolume = config["volume"].toDouble();
    discord.configure(config["discordEnabled"].toBool(),config["discordApplication"].toString());
    preferenceSaveTimer.setInterval(250);
    preferenceSaveTimer.setSingleShot(true);
    connect(&preferenceSaveTimer, &QTimer::timeout, this,
            [this] { MusicData::save(dir + "/preferences.json", config); });
    connect(QCoreApplication::instance(), &QCoreApplication::aboutToQuit, this, [this] {
        if (preferenceSaveTimer.isActive())
            MusicData::save(dir + "/preferences.json", config);
    });
    connect(&api, &Services::changed, this, &Controller::changed);
    connect(&api, &Services::message, this, &Controller::notify);
    connect(&playTimer, &QTimer::timeout, this, [this] {
        if (playingUrl.isEmpty())
            return;
        if (++playAttempts > 24) {
            playTimer.stop();
            working = false;
            playingUrl.clear();
            notify("SoundCloud не запустил трек. Проверьте вход и доступность записи");
            return;
        }
        emit javascriptRequested(
            QString("(()=>{const a=document.querySelector('.playbackSoundBadge__titleLink');if(a&&new "
                    "URL(a.href).pathname===new "
                    "URL(%1).pathname&&document.querySelector('.playControls__play.playing'))return "
                    "true;const b=document.querySelector('.fullHero .playButton,.soundTitle__playButton "
                    ".playButton');if(b&&!b.classList.contains('playing')&&!b.classList.contains('m-playing')"
                    ")b.click();return false;})()")
                .arg(js(playingUrl)),
            "play");
    });
    playTimer.setInterval(400);
}
QVariantMap Controller::colors() const {
    QVariantMap selected;
    for (auto t : themes)
        if (t.toMap()["id"] == config["theme"])
            selected = t.toMap();
    bool dark = config["mode"] == "dark";
    return {{"bg", selected.value("mode").toString() == config["mode"].toString()
                       ? selected.value("bg").toString()
                   : dark ? "#111214"
                          : "#f6f7fa"},
            {"surface", dark ? "#181a1d" : "#ffffff"},
            {"raised", dark ? "#24272c" : "#eceef2"},
            {"ink", dark ? "#f3f4f5" : "#202329"},
            {"muted", dark ? "#9b9fa6" : "#686e78"},
            {"line", dark ? "#2b2e34" : "#e0e3e8"},
            {"accent", selected.value("accent", dark ? "#a9c7f5" : "#0066cc")}};
}
bool Controller::allowed(QUrl u, bool auth) const {
    return auth ? MusicData::authUrl(u) : MusicData::soundCloud(u);
}
QString Controller::collector() const {
    return scriptFile(":/native/assets/collector.js");
}
QString Controller::injection() const {
    auto c = colors();
    QString variables =
        QString(":root{--hex-bg:%1;--hex-ink:%2;--hex-surface:%3;--hex-line:%4;--hex-muted:%5;--hex-accent:%"
                "6;--hex-mode:%7}")
            .arg(c["bg"].toString(), c["ink"].toString(), c["surface"].toString(), c["line"].toString(),
                 c["muted"].toString(), c["accent"].toString(), config["mode"].toString());
    QString css =
        QString("html,body,#app,.l-container,.l-content,.l-main,.l-fluid-fixed{background:%1!important;color:"
                "%2!important}body,button,input{font-family:system-ui!important}.header{display:none!"
                "important}body{padding-top:0!important}.l-container.l-content{padding-top:24px!important}."
                "playControls{opacity:0!important;pointer-events:none!important;transform:translateY(160px)!"
                "important}.sc-button,.dropdownMenu,.commentForm{background:%3!important;color:%2!important;"
                "border-color:%4!important;border-radius:8px!important}.soundTitle__title,.trackItem__"
                "trackTitle,.sc-link-dark,h1,h2,h3{color:%2!important}.sc-text-light,.sc-link-light{color:%5!"
                "important}.playButton,.sc-button-play{background:%6!important}.sc-artwork,.playableTile__"
                "artwork{border-radius:12px!important}.g-tabs-link.active{border-color:%6!important;color:%6!"
                "important}@media(max-width:900px){html,body,#app,.l-container{min-width:0!important;width:"
                "auto!important}.l-sidebar-right{display:none!important}.l-fluid-fixed "
                ".l-main{margin-right:0!important}.g-tabs{display:flex!important;overflow:auto!important}} ")
            .arg(c["bg"].toString(), c["ink"].toString(), c["surface"].toString(), c["line"].toString(),
                 c["muted"].toString(), c["accent"].toString());
    css = variables + scriptFile(":/native/assets/soundcloud.css") + css;
    if(config["effect"]!="none")css+="html,body,#app,.l-container,.l-content,.l-main,.l-fluid-fixed{background:transparent!important}";
    if (!config["comments"].toBool())
        css += ".commentsList,.commentForm,.listenComments{display:none!important}";
    if (!config["recommendations"].toBool())
        css += ".l-sidebar-right{display:none!important}.l-fluid-fixed .l-main{margin-right:0!important}";
    if (!config["stats"].toBool())
        css += ".soundStats,.playableTile__stats{display:none!important}";
    return scriptFile(":/native/assets/web-player.js") + scriptFile(":/native/assets/remote-player.js") +
           ";(()=>{let "
           "s=document.getElementById('hexsound-native-style');if(!s){s=document.createElement('style');s.id="
           "'hexsound-native-style';document.head.append(s);}document.documentElement.dataset.hexMotion=" +
           js(config["motion"].toBool() ? QString("true") : QString("false")) + ";s.textContent=" + js(css) +
           ";})()";
}
void Controller::show(QString p) {
    if (QStringList{"music", "wave", "lyrics", "settings"}.contains(p)) {
        screen = p;
        emit changed();
        if (p == "lyrics")
            loadLyrics();
    }
}
void Controller::navigate(QString route) {
    static QMap<QString, QString> routes{{"discover", "/discover"},   {"feed", "/feed"},
                                         {"likes", "/you/likes"},     {"playlists", "/you/sets"},
                                         {"history", "/you/history"}, {"login", "/signin"}};
    QUrl u(routes.contains(route) ? "https://soundcloud.com" + routes[route] : route);
    if (!allowed(u))
        return;
    stopWave();
    screen = "music";
    emit changed();
    emit navigationRequested(u);
}
void Controller::search(QString q) {
    if (q.trimmed().isEmpty())
        return;
    navigate("https://soundcloud.com/search?q=" +
             QString::fromUtf8(QUrl::toPercentEncoding(q.trimmed().left(300))));
}
void Controller::configure(QString key, QVariant v) {
    if (!config.contains(key))
        return;
    if (key == "mode" && !QStringList{"light", "dark"}.contains(v.toString()))
        return;
    if (key == "novelty" && !QStringList{"balanced", "familiar", "discover"}.contains(v.toString()))
        return;
    if (key == "mood" && !QStringList{"any", "calm", "energy", "focus"}.contains(v.toString()))
        return;
    if (key == "scale")
        v = qBound(85, v.toInt(), 125);
    config[key] = v;
    if(key.startsWith("discord"))discord.configure(config["discordEnabled"].toBool(),config["discordApplication"].toString());
    MusicData::save(dir + "/preferences.json", config);
    emit changed();
    if (key == "mode" || key == "theme" || key == "comments" || key == "stats" || key == "recommendations" ||
        key == "motion" || key == "effect")
        emit javascriptRequested(injection(), "theme");
}
double Controller::position() const {
    return qMin(current["duration"].toDouble(),
                current["position"].toDouble() +
                    (current["playing"].toBool() && current.value("clockKnown", true).toBool()
                         ? clock.elapsed() / 1000.0
                         : 0));
}
void Controller::poll() {
    if (polling)
        return;
    polling = true;
    emit javascriptRequested("window.HexRemotePlayer?window.HexRemotePlayer.snapshot():null", "snapshot");
    QTimer::singleShot(1800, this, [this] { polling = false; });
}
void Controller::control(QString action, double value) {
    if (action == "volume") {
        soundVolume = qBound(0.0, value, 1.0);
        pendingVolume = soundVolume;
        config["volume"] = soundVolume;
        preferenceSaveTimer.start();
        emit changed();
        if (current["available"].toBool())
            sendVolume();
        return;
    }
    if (radioActive && action == "next") {
        feedback("skip");
        return;
    }
    if (radioActive && action == "previous") {
        waveCursor = qMax(-1, waveCursor - 2);
        nextWave();
        return;
    }
    if (!QStringList{"toggle", "next", "previous", "shuffle", "repeat", "like", "seek"}.contains(action))
        return;
    emit javascriptRequested(
        QString("window.HexRemotePlayer?.control(%1,%2)").arg(js(action), QString::number(value)), "control");
}
void Controller::sendVolume() {
    if (volumeBusy || !pendingVolume)
        return;
    volumeBusy = true;
    double v = *pendingVolume;
    pendingVolume.reset();
    emit javascriptRequested(QString("window.HexRemotePlayer?.control('volume',%1)").arg(v), "volume");
    QTimer::singleShot(1500, this, [this] {
        if (volumeBusy) {
            volumeBusy = false;
            sendVolume();
        }
    });
}
void Controller::receive(QString ticket, QVariant result) {
    if(ticket=="logout") {
        if(result.toBool())emit logoutRequested();
        else notify("Не удалось завершить выход. Перезагрузите страницу и повторите");
        return;
    }
    if (ticket == "volume") {
        volumeBusy = false;
        if (!result.toBool())
            notify("Громкость пока недоступна на странице");
        sendVolume();
        return;
    }
    if (ticket == "control") {
        if (!result.toBool())
            notify("SoundCloud не подтвердил команду");
        return;
    }
    if (ticket == "play" && result.toBool()) {
        playTimer.stop();
        playingUrl.clear();
        working = false;
        emit changed();
        return;
    }
    if (ticket != "snapshot")
        return;
    polling = false;
    auto raw = result.toMap();
    if (raw.isEmpty())
        return;
    auto t = raw["track"].toMap(), p = raw["profile"].toMap();
    QString previous = current["url"].toString();
    t["title"] = field(t, "title");
    t["artist"] = field(t, "artist");
    if (!MusicData::soundCloud(QUrl(t["url"].toString())))
        t["url"] = "";
    QUrl artwork(t["artwork"].toString());
    if (artwork.scheme() != "https" ||
        !(artwork.host() == "sndcdn.com" || artwork.host().endsWith(".sndcdn.com")))
        t["artwork"] = "";
    t["duration"] = qBound(0.0, t["duration"].toDouble(), 86400.0);
    t["position"] = qBound(0.0, t["position"].toDouble(), t["duration"].toDouble());
    current = t;
    discord.update(current,current["position"].toDouble());
    if (t["available"].toBool() && !volumeReady) {
        volumeReady = true;
        soundVolume = qBound(0.0, config["volume"].toDouble(), 1.0);
        pendingVolume = soundVolume;
        sendVolume();
    }
    QString identity = p["id"].toString();
    if (identity.isEmpty())
        identity = p["url"].toString();
    if (identity.isEmpty())
        identity = p["name"].toString();
    const QString owner = p["loggedIn"].toBool() ? identity : QString();
    if (owner != libraryOwner) {
        stopWave();
        libraryOwner = owner;
        library.clear();
        recommendations.clear();
        if (!owner.isEmpty())
            library = MusicData::load(
                          dir + "/wave-" +
                          QString::fromLatin1(
                              QCryptographicHash::hash(owner.toUtf8(), QCryptographicHash::Sha256).toHex()) +
                          ".json")
                          .toList();
    }
    user = p;
    clock.restart();
    if (!volumeBusy && !pendingVolume)
        soundVolume = qBound(0.0, t.value("volume", soundVolume).toDouble(), 1.0);
    qint64 ended = raw["endedAt"].toLongLong();
    if (radioActive && ended > 0 && ended > endedAt)
        nextWave();
    endedAt = ended;
    if (previous != t["url"].toString() && screen == "lyrics")
        loadLyrics();
    emit changed();
    emit positionChanged();
}
void Controller::notify(QString s) {
    notice = s.left(500);
    emit changed();
    QTimer::singleShot(7000, this, [this, s] {
        if (notice == s) {
            notice.clear();
            emit changed();
        }
    });
}
void Controller::openLyrics() {
    show("lyrics");
}
void Controller::loadLyrics() {
    int generation = ++lyricGeneration;
    lines.clear();
    QString title = current["title"].toString(), artist = current["artist"].toString();
    if (title.isEmpty()) {
        lyricNotice = "Выберите трек в SoundCloud";
        emit changed();
        return;
    }
    QString hash = QString::fromLatin1(
        QCryptographicHash::hash((title + '|' + artist).toUtf8(), QCryptographicHash::Sha256).toHex());
    lines = MusicData::load(dir + "/lyrics/" + hash + ".json").toList();
    if (!lines.isEmpty()) {
        lyricNotice = "Локальный LRC";
        emit changed();
        return;
    }
    if (!config["lyricsOnline"].toBool()) {
        lyricNotice = "Поиск текста отключён";
        emit changed();
        return;
    }
    lyricNotice = "Ищем текст…";
    emit changed();
    QUrl u("https://lrclib.net/api/get");
    QUrlQuery q;
    q.addQueryItem("track_name", title);
    q.addQueryItem("artist_name", artist);
    q.addQueryItem("duration", QString::number(qRound(current["duration"].toDouble())));
    u.setQuery(q);
    QNetworkRequest req(u);
    req.setTransferTimeout(10000);
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto r = network.get(req);
    connect(r, &QNetworkReply::finished, this, [this, r, generation] {
        auto data = QJsonDocument::fromJson(r->readAll()).toVariant().toMap();
        auto error = r->error();
        r->deleteLater();
        if (generation != lyricGeneration)
            return;
        lines = MusicData::lrc(data["syncedLyrics"].toString());
        if (lines.isEmpty())
            for (auto text : data["plainLyrics"].toString().split('\n'))
                if (!text.trimmed().isEmpty())
                    lines.append(QVariantMap{{"time", -1}, {"text", text}});
        lyricNotice = error != QNetworkReply::NoError ? "Текст пока недоступен"
                      : lines.isEmpty()               ? "Текст не найден"
                                                      : "LRCLIB";
        emit changed();
    });
}
void Controller::importLyrics() {
    auto file = QFileDialog::getOpenFileName(nullptr, "Открыть LRC", {}, "LRC (*.lrc)");
    if (file.isEmpty())
        return;
    QFile f(file);
    if (!f.open(QIODevice::ReadOnly) || f.size() > 500000) {
        notify("Файл LRC больше 500 КБ или недоступен");
        return;
    }
    auto parsed = MusicData::lrc(QString::fromUtf8(f.readAll()));
    if (parsed.isEmpty()) {
        notify("В файле нет таймкодов");
        return;
    }
    ++lyricGeneration;
    lines = parsed;
    QString hash = QString::fromLatin1(
        QCryptographicHash::hash((current["title"].toString() + '|' + current["artist"].toString()).toUtf8(),
                                 QCryptographicHash::Sha256)
            .toHex());
    MusicData::save(dir + "/lyrics/" + hash + ".json", lines);
    lyricNotice = "Локальный LRC";
    emit changed();
}
void Controller::chooseBackground() {
    QString f = QFileDialog::getOpenFileName(nullptr, "Фон", {}, "Images (*.png *.jpg *.jpeg *.webp)");
    if (!f.isEmpty())
        configure("background", QUrl::fromLocalFile(f).toString());
}
void Controller::importMusic() {
    QString file = QFileDialog::getOpenFileName(nullptr, "Импортировать список", {},
                                                "Список музыки (*.csv *.tsv *.json)");
    if (file.isEmpty())
        return;
    QFile f(file);
    if (!f.open(QIODevice::ReadOnly) || f.size() > 10 * 1024 * 1024) {
        notify("Файл недоступен или больше 10 МБ");
        return;
    }
    QString error;
    auto tracks = MusicData::importFile(f.readAll(), QFileInfo(file).suffix(), &error);
    if (!error.isEmpty()) {
        notify(error);
        return;
    }
    imported = tracks;
    api.review.clear();
    MusicData::save(dir + "/imports.json", imported);
    notify(QString("Прочитано %1 треков").arg(imported.size()));
}
void Controller::previewImport() {
    api.preview(imported);
}
void Controller::commitImport(QString n, QVariantMap choices) {
    api.transfer(n, choices);
}
void Controller::connectApi(QString c, QString s) {
    api.connectAccount(c, s);
}
void Controller::tokenApi(QString t) {
    api.importToken(t);
}
void Controller::disconnectApi() {
    api.disconnectAccount();
}
void Controller::cancel() {
    api.cancel();
    stopWave();
}
void Controller::resumeImport() {
    api.resume();
}
void Controller::startWave() {
    if (!user["loggedIn"].toBool() || libraryOwner.isEmpty()) {
        notify("Сначала войдите в SoundCloud");
        return;
    }
    if (radioActive) {
        control("toggle");
        return;
    }
    screen = "wave";
    radioActive = true;
    working = true;
    waveGeneration++;
    recommendations.clear();
    waveCursor = -1;
    emit changed();
    if (library.isEmpty())
        collectWave("likes");
    else {
        if (config["novelty"] != "discover") {
            appendWave(library);
            nextWave();
        }
        collectWave("search");
    }
}
void Controller::stopWave() {
    waveGeneration++;
    workerPending.clear();
    radioActive = false;
    working = false;
    playingUrl.clear();
    playTimer.stop();
    emit workerStopped();
    emit changed();
}
void Controller::collectWave(QString stage) {
    if (!radioActive || !workerPending.isEmpty() || config["novelty"] == "familiar" && stage == "search")
        return;
    QString ticket = QString::number(waveGeneration) + ":" + stage;
    workerPending = ticket;
    if (stage == "likes")
        emit workerRequested(QUrl("https://soundcloud.com/you/likes"), ticket);
    else {
        if (library.isEmpty()) {
            workerPending.clear();
            return;
        }
        QVariantList seeds = library;
        for (auto track : recommendations)
            if (ratings[MusicData::key(track.toMap())] == "like")
                for (int i = 0; i < 3; i++)
                    seeds.append(track);
        auto seed = seeds[QRandomGenerator::global()->bounded(seeds.size())].toMap();
        QString mood = config["mood"].toString(), query = seed["artist"].toString();
        if (query.isEmpty())
            query = seed["title"].toString();
        if (mood == "calm")
            query += " chill ambient";
        if (mood == "energy")
            query += " energetic dance";
        if (mood == "focus")
            query += " instrumental focus";
        emit workerRequested(QUrl("https://soundcloud.com/search/sounds?q=" +
                                  QString::fromUtf8(QUrl::toPercentEncoding(query))),
                             ticket);
    }
}
void Controller::appendWave(QVariantList tracks) {
    std::shuffle(tracks.begin(), tracks.end(), *QRandomGenerator::global());
    std::stable_sort(tracks.begin(), tracks.end(), [this](auto a, auto b) {
        return (ratings[MusicData::key(a.toMap())] == "like") >
               (ratings[MusicData::key(b.toMap())] == "like");
    });
    QSet<QString> existing;
    for (auto t : recommendations)
        existing.insert(MusicData::key(t.toMap()));
    QSet<QString> known;
    for (auto t : library)
        known.insert(MusicData::key(t.toMap()));
    int discoveries = 0;
    for (auto t : tracks) {
        auto m = t.toMap();
        QString k = MusicData::key(m);
        if (!MusicData::soundCloud(QUrl(m["url"].toString())) || field(m, "title").isEmpty() ||
            existing.contains(k) || ratings[k].toString() == "dislike")
            continue;
        if (config["novelty"] == "discover" && known.contains(k))
            continue;
        m["reason"] = known.contains(k) ? "Из ваших лайков" : "По вашим исполнителям";
        if (config["novelty"] == "balanced" && !known.contains(k) && waveCursor >= 0) {
            recommendations.insert(qMin(recommendations.size(), qsizetype(waveCursor + 2 + discoveries * 3)),
                                   m);
            discoveries++;
        } else
            recommendations.append(m);
        existing.insert(k);
        if (recommendations.size() >= 150)
            break;
    }
    emit changed();
}
void Controller::workerResult(QString ticket, QVariantMap data) {
    if (!radioActive || ticket.section(':', 0, 0).toInt() != waveGeneration)
        return;
    workerPending.clear();
    auto rows = data["rows"].toList();
    if (ticket.endsWith(":likes")) {
        if (data["login"].toBool()) {
            stopWave();
            notify("Сначала войдите в SoundCloud");
            return;
        }
        if (rows.isEmpty()) {
            stopWave();
            notify("Не удалось прочитать лайки. Откройте любимые треки и проверьте аккаунт");
            return;
        }
        library = rows;
        MusicData::save(
            dir + "/wave-" +
                QString::fromLatin1(
                    QCryptographicHash::hash(libraryOwner.toUtf8(), QCryptographicHash::Sha256).toHex()) +
                ".json",
            library);
        if (config["novelty"] != "discover") {
            appendWave(rows);
            nextWave();
        }
        collectWave("search");
    } else {
        appendWave(rows);
        working = false;
        if (recommendations.isEmpty()) {
            stopWave();
            notify("SoundCloud не вернул новых треков. Попробуйте другой характер или настроение волны");
            return;
        }
        if (waveCursor < 0 && !recommendations.isEmpty())
            nextWave();
        emit changed();
    }
}
void Controller::workerError(QString t, QString e) {
    if (t.section(':', 0, 0).toInt() != waveGeneration)
        return;
    workerPending.clear();
    working = false;
    notify(e);
}
void Controller::nextWave() {
    if (!radioActive)
        return;
    if (recommendations.isEmpty()) {
        working = true;
        collectWave("search");
        return;
    }
    waveCursor++;
    if (waveCursor >= recommendations.size()) {
        waveCursor = 0;
        notify("Новых записей пока нет — продолжаем микс лайков");
    }
    if (waveCursor > 12) {
        recommendations.erase(recommendations.begin(), recommendations.begin() + waveCursor - 8);
        waveCursor = 8;
    }
    auto t = recommendations[waveCursor].toMap();
    if (ratings[MusicData::key(t)].toString() == "dislike") {
        recommendations.removeAt(waveCursor--);
        if (!recommendations.isEmpty())
            nextWave();
        return;
    }
    playingUrl = t["url"].toString();
    working = true;
    playAttempts = 0;
    emit navigationRequested(QUrl(playingUrl));
    playTimer.start();
    if (recommendations.size() - waveCursor <= 4)
        collectWave("search");
    emit changed();
}
void Controller::playWave(int row) {
    if (row < 0 || row >= recommendations.size())
        return;
    radioActive = true;
    waveCursor = row - 1;
    nextWave();
}
void Controller::feedback(QString action) {
    if (!radioActive || waveCursor < 0 || waveCursor >= recommendations.size())
        return;
    ratings[MusicData::key(recommendations[waveCursor].toMap())] = action;
    MusicData::save(dir + "/feedback.json", ratings);
    if (action == "dislike" || action == "skip")
        nextWave();
    else
        notify("Учтём в следующих подборках");
}
void Controller::github(QUrl url, std::function<void(QByteArray, QString)> done, int redirects) {
    if (!updateHost(url) || redirects > 5) {
        done({}, "Недопустимый сервер обновления");
        return;
    }
    QNetworkRequest req(url);
    req.setRawHeader("User-Agent", "HexSoundNative/" HEXSOUND_VERSION);
    req.setTransferTimeout(15000);
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto reply = network.get(req);
    connect(reply,&QNetworkReply::readyRead,this,[reply]{if(reply->bytesAvailable()>16*1024*1024)reply->abort();});
    connect(reply, &QNetworkReply::finished, this, [this, reply, url, done, redirects] {
        auto target = reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl();
        auto error = reply->error();
        auto bytes = reply->readAll();
        reply->deleteLater();
        if (!target.isEmpty()) {
            github(url.resolved(target), done, redirects + 1);
            return;
        }
        done(bytes, error == QNetworkReply::NoError ? QString() : "Не удалось получить обновление");
    });
}
void Controller::checkUpdates() {
    if(checkingUpdates||updateReply)return;
    checkingUpdates=true;
    updateAsset.clear();downloaded.clear();notes.clear();
    updateNotice = "Проверяем GitHub…";
    emit changed();
    github(QUrl("https://api.github.com/repos/hexokryn/HexSound/releases/latest"),
           [this](QByteArray data, QString error) {
               checkingUpdates=false;
               auto release = QJsonDocument::fromJson(data).object();
               QString version = release["tag_name"].toString();
               if(error.isEmpty()&&!QRegularExpression("^v?[0-9]+\\.[0-9]+\\.[0-9]+$").match(version).hasMatch())error="GitHub вернул некорректное описание версии";
               version.remove('v');
               notes = release["body"].toString().left(30000);
               if (!error.isEmpty()) {
                   updateNotice = error;
                   emit changed();
                   return;
               }
               if (QVersionNumber::fromString(version) <= QVersionNumber::fromString(HEXSOUND_VERSION) ||
                   release["draft"].toBool() || release["prerelease"].toBool()) {
                   updateNotice = "Установлена последняя версия";
                   emit changed();
                   return;
               }
#ifdef Q_OS_WIN
               QString name = "HexSound-" + version + "-native-portable.zip";
#else
 QString name="HexSound-"+version+"-linux-amd64.deb";
#endif
               updateAsset.clear();
               for (auto value : release["assets"].toArray()) {
                   auto a = value.toObject().toVariantMap();
                   if (a["name"] == name &&
                       QRegularExpression("^sha256:[a-f0-9]{64}$").match(a["digest"].toString()).hasMatch() &&
                       a["size"].toLongLong() > 0 && a["size"].toLongLong() < 512 * 1024 * 1024 &&
                       a["browser_download_url"].toString().startsWith(
                           "https://github.com/hexokryn/HexSound/releases/download/" +
                           release["tag_name"].toString() + "/"))
                       updateAsset = a;
               }
               updateNotice = updateAsset.isEmpty() ? "Нет проверяемой сборки для этой платформы"
                                                    : "Доступна версия " + version;
               emit changed();
           });
}
void Controller::downloadUpdate() {
    if (updateAsset.isEmpty() || updateReply)
        return;
    QDir().mkpath(dir + "/updates");
    downloaded = dir + "/updates/" + QFileInfo(updateAsset["name"].toString()).fileName();
    auto file = new QFile(downloaded + ".part", this);
    if (!file->open(QIODevice::WriteOnly)) {
        notify("Не удалось создать файл обновления");
        file->deleteLater();
        return;
    }
    auto fetch = std::make_shared<std::function<void(QUrl, int)>>();
    *fetch = [this, file, fetch](QUrl url, int hops) {
        if (!updateHost(url) || hops > 5) {
            file->close();
            file->remove();
            file->deleteLater();
            *fetch = {};
            notify("Недопустимый сервер обновления");
            return;
        }
        QNetworkRequest req(url);
        req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
        req.setTransferTimeout(30000);
        updateReply = network.get(req);
        auto reply = updateReply;
        connect(reply, &QNetworkReply::readyRead, this, [this, reply, file] {
            if (!reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl().isEmpty())
                return;
            auto bytes = reply->readAll();
            if (file->size() + bytes.size() > updateAsset["size"].toLongLong() ||
                file->write(bytes) != bytes.size())
                reply->abort();
        });
        connect(reply, &QNetworkReply::downloadProgress, this, [this](qint64 bytes, qint64) {
            updateNotice =
                QString("Загрузка %1%").arg(bytes * 100 / qMax<qint64>(1, updateAsset["size"].toLongLong()));
            emit changed();
        });
        connect(reply, &QNetworkReply::finished, this, [this, file, fetch, reply, url, hops] {
            auto target = reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl();
            auto error = reply->error();
            reply->deleteLater();
            updateReply = nullptr;
            if (!target.isEmpty()) {
                (*fetch)(url.resolved(target), hops + 1);
                return;
            }
            file->close();
            QFile verify(file->fileName());
            verify.open(QIODevice::ReadOnly);
            QCryptographicHash hash(QCryptographicHash::Sha256);
            hash.addData(&verify);
            bool valid =
                error == QNetworkReply::NoError && verify.size() == updateAsset["size"].toLongLong() &&
                "sha256:" + QString::fromLatin1(hash.result().toHex()) == updateAsset["digest"].toString();
            verify.close();
            if (valid) {
                QFile::remove(downloaded);
                valid = file->rename(downloaded);
            }
            if (!valid)
                file->remove();
            file->deleteLater();
            updateNotice =
                valid ? "Обновление проверено. Можно установить" : "Проверка обновления не пройдена";
            emit changed();
            *fetch = {};
        });
    };
    (*fetch)(QUrl(updateAsset["browser_download_url"].toString()), 0);
}
void Controller::installUpdate() {
    if(updateReply||checkingUpdates)return;
    QFile f(downloaded);
    if (!f.open(QIODevice::ReadOnly)) {
        notify("Сначала загрузите обновление");
        return;
    }
    QCryptographicHash hash(QCryptographicHash::Sha256);
    hash.addData(&f);
    bool valid = f.size() == updateAsset["size"].toLongLong() &&
                 "sha256:" + QString::fromLatin1(hash.result().toHex()) == updateAsset["digest"].toString();
    f.close();
    if (!valid) {
        notify("Файл изменился, установка отменена");
        return;
    }
#ifdef Q_OS_WIN
    QTemporaryFile writable(QCoreApplication::applicationDirPath()+"/.update-check-XXXXXX");
    if(!writable.open()){notify("Нет доступа к папке приложения. Переместите приложение в доступную папку");return;}writable.close();
    QTemporaryDir helperDir(QDir::tempPath()+"/HexSound-update-XXXXXX");helperDir.setAutoRemove(false);
    if(!helperDir.isValid()){notify("Не удалось подготовить обновление");return;}
    QString root=QCoreApplication::applicationDirPath();
    QDirIterator binaries(root,QStringList{"HexSoundUpdate.exe","Qt6Core.dll","msvcp140*.dll","vcruntime140*.dll","concrt140.dll"},QDir::Files);
    while(binaries.hasNext()){auto path=binaries.next();if(!QFile::copy(path,helperDir.path()+"/"+QFileInfo(path).fileName())){notify("Не удалось скопировать помощник обновления");return;}}
    QVariantMap job{{"archive",downloaded},{"target",root},{"dataDirectory",dir},{"size",updateAsset["size"]},{"sha256",updateAsset["digest"].toString().mid(7)},{"pid",QCoreApplication::applicationPid()}};
    QString jobPath=helperDir.path()+"/job.json";
    if(!MusicData::save(jobPath,job)||!QProcess::startDetached(helperDir.path()+"/HexSoundUpdate.exe",{jobPath})){notify("Не удалось запустить обновление");return;}
    QCoreApplication::quit();
#else
    notify("Автоматическая замена файлов на этой платформе пока не поддерживается");
#endif
}
