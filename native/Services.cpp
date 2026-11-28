#include "Services.h"
#include "MusicData.h"
#include <QDesktopServices>
#include <algorithm>
#include <utility>
#ifdef Q_OS_WIN
#include <windows.h>
#include <wincrypt.h>
#endif
namespace {
QString identifier(const QVariantMap &value) {
    QString id=value.value("urn").toString();
    return id.isEmpty()?value.value("id").toString():id;
}
}
QNetworkReply *Services::send(const QNetworkRequest &request,const QByteArray &method,const QByteArray &body){
    return method=="GET"?network.get(request):network.sendCustomRequest(request,method,body);
}
Services::Services(QString directory, QObject *p) : QObject(p), dir(directory) {
#ifdef Q_OS_WIN
    QFile f(dir + "/api.enc");
    if (f.open(QIODevice::ReadOnly)) {
        auto bytes = f.readAll();
        DATA_BLOB input{DWORD(bytes.size()), reinterpret_cast<BYTE *>(bytes.data())}, output{};
        if (CryptUnprotectData(&input, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN,
                               &output)) {
            auto m =
                QJsonDocument::fromJson(QByteArray(reinterpret_cast<char *>(output.pbData), output.cbData))
                    .toVariant()
                    .toMap();
            LocalFree(output.pbData);
            token = m["token"].toString();
            refreshToken = m["refresh"].toString();
            clientId = m["client"].toString();
            clientSecret = m["secret"].toString();
            profile = m["profile"].toMap();
        }
    }
#endif
    if(connected())status="Сохранён аккаунт: "+profile["name"].toString();

    connect(&listener, &QTcpServer::newConnection, this, [this] {
        auto socket = listener.nextPendingConnection();
        const int generation = revision;
        QTimer::singleShot(5000, socket, [socket] { socket->disconnectFromHost(); });
        connect(socket, &QTcpSocket::readyRead, this, [this, socket, generation] {
            auto raw = socket->property("request").toByteArray() + socket->readAll();
            if (raw.size() > 8192 || generation != revision) {
                socket->disconnectFromHost();
                return;
            }
            socket->setProperty("request", raw);
            if (!raw.contains("\r\n\r\n"))
                return;
            const auto first = raw.split('\n').value(0).trimmed().split(' ');
            const QUrl u("http://127.0.0.1" + QString::fromUtf8(first.value(1)));
            const QUrlQuery query(u);
            bool host = false;
            for (auto line : raw.split('\n'))
                if (line.trimmed().toLower() == "host: 127.0.0.1:8766")
                    host = true;
            if (!host || first.value(0) != "GET" || first.size() != 3 || !first.value(1).startsWith('/') ||
                u.path() != "/callback/soundcloud" || authState.isEmpty() ||
                query.queryItemValue("state") != authState) {
                socket->write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                socket->disconnectFromHost();
                return;
            }
            const QString code = query.queryItemValue("code");
            authState.clear();
            socket->write("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: "
                          "close\r\n\r\nReturn to HexSound");
            socket->disconnectFromHost();
            listener.close();
            if (code.isEmpty()) {
                fail("Вход отменён");
                return;
            }
            QUrlQuery form;
            form.addQueryItem("grant_type", "authorization_code");
            form.addQueryItem("client_id", clientId);
            form.addQueryItem("client_secret", clientSecret);
            form.addQueryItem("redirect_uri", "http://127.0.0.1:8766/callback/soundcloud");
            form.addQueryItem("code_verifier", verifier);
            form.addQueryItem("code", code);
            QNetworkRequest req(QUrl("https://secure.soundcloud.com/oauth/token"));
            req.setHeader(QNetworkRequest::ContentTypeHeader, "application/x-www-form-urlencoded");
            req.setTransferTimeout(20000);
            req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
            auto reply = network.post(req, form.query(QUrl::FullyEncoded).toUtf8());
            requests.insert(reply);
            connect(reply, &QNetworkReply::finished, this, [this, reply, generation] {
                requests.remove(reply);
                const auto bytes = reply->readAll();
                const auto error = reply->error();
                reply->deleteLater();
                if (generation != revision)
                    return;
                const auto m = QJsonDocument::fromJson(bytes).toVariant().toMap();
                if (error != QNetworkReply::NoError || bytes.size() > 65536 ||
                    m["access_token"].toString().isEmpty()) {
                    fail("SoundCloud не подтвердил API-доступ");
                    return;
                }
                importToken(m["access_token"].toString(), m["refresh_token"].toString());
            });
        });
        connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
    });
}

void Services::saveToken() {
#ifdef Q_OS_WIN
    auto bytes = QJsonDocument::fromVariant(QVariantMap{{"token", token},
                                                        {"refresh", refreshToken},
                                                        {"client", clientId},
                                                        {"secret", clientSecret},
                                                        {"profile", profile}})
                     .toJson();
    DATA_BLOB input{DWORD(bytes.size()), reinterpret_cast<BYTE *>(bytes.data())}, output{};
    if (CryptProtectData(&input, L"HexSound", nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN,
                         &output)) {
        QDir().mkpath(dir);
        QSaveFile f(dir + "/api.enc");
        if (f.open(QIODevice::WriteOnly)) {
            f.write(reinterpret_cast<char *>(output.pbData), output.cbData);
            f.commit();
        }
        LocalFree(output.pbData);
    }
#endif
}
void Services::fail(QString error) {
    busy = false;
    status = error;
    emit changed();
    emit message(error);
}
void Services::refreshSession(std::function<void(bool)> done) {
    refreshWaiters.append(done);
    if (refreshing)
        return;
    refreshing = true;
    const int generation = revision;
    QUrlQuery form;
    form.addQueryItem("grant_type", "refresh_token");
    form.addQueryItem("refresh_token", refreshToken);
    form.addQueryItem("client_id", clientId);
    form.addQueryItem("client_secret", clientSecret);
    QNetworkRequest req(QUrl("https://secure.soundcloud.com/oauth/token"));
    req.setHeader(QNetworkRequest::ContentTypeHeader, "application/x-www-form-urlencoded");
    req.setTransferTimeout(20000);
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto reply = network.post(req, form.query(QUrl::FullyEncoded).toUtf8());
    requests.insert(reply);
    connect(reply, &QNetworkReply::finished, this, [this, reply, generation] {
        requests.remove(reply);
        auto bytes = reply->readAll();
        const auto error = reply->error();
        reply->deleteLater();
        if (generation != revision)
            return;
        auto data = QJsonDocument::fromJson(bytes).object();
        const bool ok = bytes.size() < 65536 && error == QNetworkReply::NoError &&
                        !data["access_token"].toString().isEmpty();
        if (ok) {
            token = data["access_token"].toString();
            if (!data["refresh_token"].toString().isEmpty())
                refreshToken = data["refresh_token"].toString();
            saveToken();
        }
        refreshing = false;
        auto waiters = std::exchange(refreshWaiters, {});
        for (auto callback : waiters)
            callback(ok);
    });
}
void Services::request(QString path, QByteArray method, QVariant body,
                       std::function<void(QVariant, QString)> done, bool retried) {
    QUrl url = QUrl("https://api.soundcloud.com/").resolved(QUrl(path));
    if (url.scheme() != "https" || url.host() != "api.soundcloud.com" || !url.userInfo().isEmpty()) {
        done({}, "Недопустимый адрес API");
        return;
    }
    if (token.isEmpty()) {
        done({}, "Подключите API SoundCloud");
        return;
    }
    QNetworkRequest req(url);
    req.setRawHeader("Authorization", "OAuth " + token.toUtf8());
    req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    req.setTransferTimeout(20000);
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    auto reply = send(req,method,QJsonDocument::fromVariant(body).toJson(QJsonDocument::Compact));
    requests.insert(reply);
    connect(reply, &QNetworkReply::readyRead, this, [reply] {
        if (reply->bytesAvailable() > 16000000)
            reply->abort();
    });
    connect(reply, &QNetworkReply::finished, this,
            [this, reply, done, path, method, body, retried, generation = revision] {
                requests.remove(reply);
                if (generation != revision) {
                    reply->deleteLater();
                    return;
                }
                int code = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
                auto bytes = reply->readAll();
                if (code == 401 && method == "GET" && !retried && !refreshToken.isEmpty()) {
                    reply->deleteLater();
                    refreshSession([this, path, method, body, done, generation](bool ok) {
                        if (generation != revision)
                            return;
                        if (ok)
                            request(path, method, body, done, true);
                        else
                            done({}, "API-сессия истекла. Подключите аккаунт повторно");
                    });
                    return;
                }
                QString error;
                if (reply->error() != QNetworkReply::NoError || code < 200 || code >= 300)
                    error = code == 401   ? "API-сессия истекла. Подключите аккаунт повторно"
                            : code == 403 ? "SoundCloud не разрешил операцию"
                                          : "Запрос SoundCloud не подтверждён";
                if (bytes.size() > 16000000)
                    error = "Слишком большой ответ API";
                auto value = QJsonDocument::fromJson(bytes).toVariant();
                reply->deleteLater();
                done(value, error);
            });
}
void Services::connectAccount(QString client, QString secret) {
    if (client.isEmpty() || secret.isEmpty() || client.size() > 4096 || secret.size() > 4096) {
        fail("Нужны Client ID и Client Secret собственного SoundCloud-приложения");
        return;
    }
    cancel();
    clientId = client;
    clientSecret = secret;
    authState = QUuid::createUuid().toString(QUuid::WithoutBraces);
    verifier = QCryptographicHash::hash(QUuid::createUuid().toByteArray() + QUuid::createUuid().toByteArray(),
                                        QCryptographicHash::Sha512)
                   .toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals);
    auto challenge = QCryptographicHash::hash(verifier.toUtf8(), QCryptographicHash::Sha256)
                         .toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals);
    if (!listener.listen(QHostAddress::LocalHost, 8766)) {
        fail("Порт 8766 занят");
        return;
    }
    QUrl url("https://secure.soundcloud.com/authorize");
    QUrlQuery q;
    q.addQueryItem("client_id", clientId);
    q.addQueryItem("redirect_uri", "http://127.0.0.1:8766/callback/soundcloud");
    q.addQueryItem("response_type", "code");
    q.addQueryItem("state", authState);
    q.addQueryItem("code_challenge", challenge);
    q.addQueryItem("code_challenge_method", "S256");
    url.setQuery(q);
    busy = true;
    status = "Ожидаем разрешение SoundCloud";
    emit changed();
    QDesktopServices::openUrl(url);
    int generation = revision;
    QTimer::singleShot(180000, this, [this, generation] {
        if (generation == revision && listener.isListening()) {
            listener.close();
            fail("Время входа истекло");
        }
    });
}
void Services::importToken(QString value, QString refresh) {
    cancel();
    profile.clear();
    QFile::remove(dir+"/api.enc");
    refreshToken = refresh;
    if(refresh.isEmpty()){clientId.clear();clientSecret.clear();}
    review.clear();
    token = value.trimmed().left(4096);
    busy=true;
    status="Проверяем аккаунт SoundCloud…";
    emit changed();
    int generation = revision;
    request("me", "GET", {}, [this, generation](QVariant data, QString error) {
        if (generation != revision)
            return;
        if (!error.isEmpty()) {
            token.clear();
            fail(error);
            return;
        }
        auto m = data.toMap();
        if (m["id"].toString().isEmpty() && m["urn"].toString().isEmpty()) {
            token.clear();
            fail("Не получен профиль API");
            return;
        }
        profile = {{"id", identifier(m)}, {"name", m["username"]}};
        saveToken();
        busy=false;
        status = "Подключён: " + profile["name"].toString();
        emit changed();
    });
}
void Services::disconnectAccount() {
    cancel();
    token.clear();
    refreshToken.clear();
    clientId.clear();clientSecret.clear();review.clear();
    profile.clear();
    QFile::remove(dir + "/api.enc");
    status = "API отключён";
    emit changed();
}
void Services::cancel() {
    revision++;
    if(auto step=activePreview.lock())*step={};
    activePreview.reset();
    authState.clear();
    verifier.clear();
    refreshing = false;
    refreshWaiters.clear();
    listener.close();
    auto pending = requests;
    for (auto r : pending)
        r->abort();
    busy = false;
    emit changed();
}
void Services::resume() {
    if (busy)
        return;
    auto job = MusicData::load(dir + "/transfer-journal.json").toMap();
    if (!connected() || job["account"].toString() != account()) {
        fail("Подключите тот же аккаунт назначения");
        return;
    }
    if (job["playlist"].toString().isEmpty() || job["status"] == "complete") {
        fail("Нет подтверждённого незавершённого плейлиста. Проверьте SoundCloud перед новым переносом");
        return;
    }
    if (job["ids"].toList().isEmpty()) {
        fail("В журнале нет подтверждённых треков");
        return;
    }
    busy = true;
    append(job["playlist"].toString(), job["ids"].toList(), revision);
}
void Services::preview(QVariantList tracks) {
    if (busy)
        return;
    if (tracks.isEmpty() || tracks.size() > 5000) {
        fail("Выберите от 1 до 5000 записей");
        return;
    }
    cancel();
    busy = true;
    review.clear();
    int generation = revision;
    auto index = std::make_shared<int>(0);
    auto step = std::make_shared<std::function<void()>>();
    activePreview=step;
    *step = [this, tracks, index, step, generation] {
        if (generation != revision) {
            *step = {};
            return;
        }
        if (*index >= tracks.size()) {
            busy = false;
            status = "Проверьте совпадения";
            emit changed();
            *step = {};
            return;
        }
        auto source = tracks[(*index)++].toMap();
        status = QString("Поиск %1 / %2").arg(*index).arg(tracks.size());
        emit changed();
        QUrlQuery q;
        q.addQueryItem("q", source["title"].toString() + " " + source["artist"].toString());
        q.addQueryItem("limit", "20");
        request("tracks?" + q.query(QUrl::FullyEncoded), "GET", {},
                [this, source, step, generation](QVariant data, QString error) {
                    if (generation != revision) {
                        *step = {};
                        return;
                    }
                    if (!error.isEmpty()) {
                        fail(error);
                        *step = {};
                        return;
                    }
                    QVariantList candidates;
                    auto raw = data.typeId() == QMetaType::QVariantList ? data.toList()
                                                                        : data.toMap()["collection"].toList();
                    for (auto v : raw) {
                        auto m = v.toMap();
                        QVariantMap t{{"id", identifier(m)},
                                      {"title", m["title"]},
                                      {"artist", m["user"].toMap()["username"]},
                                      {"duration", m["duration"].toDouble() / 1000},
                                      {"url", m["permalink_url"]}};
                        double score = MusicData::match(source, t);
                        if (score >= .55 && !t["id"].toString().isEmpty()) {
                            t["score"] = score;
                            candidates.append(t);
                        }
                    }
                    std::sort(candidates.begin(), candidates.end(), [](auto a, auto b) {
                        return a.toMap()["score"].toDouble() > b.toMap()["score"].toDouble();
                    });
                    QString selected;
                    if (!candidates.isEmpty() && candidates[0].toMap()["score"].toDouble() >= .90 &&
                        (candidates.size() < 2 || candidates[0].toMap()["score"].toDouble() -
                                                          candidates[1].toMap()["score"].toDouble() >=
                                                      .08))
                        selected = candidates[0].toMap()["id"].toString();
                    review.append(
                        QVariantMap{{"source", source}, {"candidates", candidates}, {"selected", selected}});
                    emit changed();
                    QTimer::singleShot(100, this, *step);
                });
    };
    (*step)();
}
void Services::transfer(QString name, QVariantMap choices) {
    if (busy || review.isEmpty())
        return;
    if (!connected() || account().isEmpty() || name.trimmed().isEmpty()) {
        fail("Подключите API и укажите название плейлиста");
        return;
    }
    QVariantList ids;
    QSet<QString> seen;
    for (int i = 0; i < review.size(); ++i) {
        auto row = review[i].toMap();
        QString selected = choices.value(QString::number(i), row["selected"]).toString();
        auto candidates = row["candidates"].toList();
        if (selected.isEmpty() && !candidates.isEmpty() && !choices.contains(QString::number(i))) {
            fail("Выберите совпадение или явный пропуск для каждой записи");
            return;
        }
        bool valid = selected.isEmpty();
        for (auto c : candidates)
            valid |= c.toMap()["id"] == selected;
        if (!valid) {
            fail("Совпадение устарело");
            return;
        }
        if (!selected.isEmpty() && !seen.contains(selected)) {
            seen.insert(selected);
            ids.append(selected);
        }
    }
    if (ids.isEmpty()) {
        fail("Нет подтверждённых записей");
        return;
    }
    busy = true;
    int generation = revision;
    QString owner = account();
    status = "Создаём новый плейлист";
    emit changed();
    if (!MusicData::save(
            dir + "/transfer-journal.json",
            QVariantMap{{"account", owner}, {"name", name}, {"ids", ids}, {"status", "creating"}})) {
        fail("Не удалось сохранить журнал. Перенос не начат");
        return;
    }
    request("playlists", "POST",
            QVariantMap{{"playlist", QVariantMap{{"title", name.trimmed().left(200)},
                                                 {"sharing", "private"},
                                                 {"tracks", QVariantList{}}}}},
            [this, generation, owner, ids, name](QVariant data, QString error) {
                if (generation != revision || account() != owner)
                    return;
                QString playlist = identifier(data.toMap());
                if (!error.isEmpty() || playlist.isEmpty()) {
                    fail("Создание не подтверждено. Проверьте SoundCloud перед повтором");
                    return;
                }
                if (!MusicData::save(dir + "/transfer-journal.json", QVariantMap{{"account", owner},
                                                                                 {"name", name},
                                                                                 {"ids", ids},
                                                                                 {"playlist", playlist},
                                                                                 {"status", "writing"}})) {
                    fail("Плейлист создан, но журнал не сохранён. Проверьте SoundCloud перед повтором");
                    return;
                }
                append(playlist, ids, generation);
            });
}
void Services::append(QString playlist, QVariantList ids, int generation) {
    request("playlists/" + QString::fromUtf8(QUrl::toPercentEncoding(playlist)) + "?show_tracks=true", "GET",
            {}, [this, playlist, ids, generation](QVariant data, QString error) {
                if (generation != revision)
                    return;
                auto m = data.toMap();
                auto tracks = m["tracks"].toList();
                auto owner = m["user"].toMap();
                QString ownerId = identifier(owner);
                auto canonical = [](QString id) { return id.section(':', -1); };
                if (ownerId.isEmpty() || canonical(ownerId) != canonical(account())) {
                    fail("Плейлист принадлежит другому аккаунту");
                    return;
                }
                if (!error.isEmpty() || !m.contains("track_count") || m["track_count"].toInt()<0 ||
                    m["tracks"].typeId()!=QMetaType::QVariantList || m["track_count"].toInt()!=tracks.size()) {
                    fail("Не получен полный состав назначения. Запись остановлена");
                    return;
                }
                QSet<QString> present;
                QVariantList all;
                for (auto t : tracks) {
                    auto item = t.toMap();
                    QString urn = identifier(item);
                    if(urn.isEmpty()){fail("Не удалось определить существующий трек. Запись остановлена");return;}
                    if(!urn.startsWith("soundcloud:"))urn="soundcloud:tracks:"+urn;
                    present.insert(urn);
                    all.append(QVariantMap{{"urn", urn}});
                }
                for (auto value : ids) {
                    QString urn = value.toString();
                    if (!urn.startsWith("soundcloud:"))
                        urn = "soundcloud:tracks:" + urn;
                    if (!present.contains(urn)) {
                        present.insert(urn);
                        all.append(QVariantMap{{"urn", urn}});
                    }
                }
                status = "Записываем подтверждённые треки";
                emit changed();
                request("playlists/" + QString::fromUtf8(QUrl::toPercentEncoding(playlist)), "PUT",
                        QVariantMap{{"playlist", QVariantMap{{"tracks", all}}}},
                        [this, generation](QVariant, QString error) {
                            if (generation != revision)
                                return;
                            if (!error.isEmpty()) {
                                fail("Запись не подтверждена. Проверьте плейлист перед повтором");
                                return;
                            }
                            auto job = MusicData::load(dir + "/transfer-journal.json").toMap();
                            job["status"] = "complete";
                            MusicData::save(dir + "/transfer-journal.json", job);
                            busy = false;
                            status = "Плейлист создан в SoundCloud";
                            emit changed();
                        });
            });
}
