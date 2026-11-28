#include "DiscordPresence.h"
#include <QtEndian>
DiscordPresence::DiscordPresence(QObject *p, QString testEndpoint) : QObject(p), endpoint(testEndpoint) {
    retry.setInterval(2500);
    connect(&retry, &QTimer::timeout, this, &DiscordPresence::connectPipe);
    throttle.setInterval(5000);
    connect(&throttle, &QTimer::timeout, this, &DiscordPresence::publish);
    connect(&socket, &QLocalSocket::connected, this, [this] {
        input.clear();
        frame(0, {{"v", 1}, {"client_id", id}});
    });
    connect(&socket, &QLocalSocket::disconnected, this, [this] {
        ready = false;
        if (enabled)
            setStatus("Discord не подключён");
    });
    connect(&socket, &QLocalSocket::errorOccurred, this, [this] {
        ready = false;
        if (enabled)
            setStatus("Ожидаем настольный Discord");
    });
    connect(&socket, &QLocalSocket::readyRead, this, [this] {
        input += socket.readAll();
        if (input.size() > 1024 * 1024) {
            socket.abort();
            return;
        }
        while (input.size() >= 8) {
            auto op = qFromLittleEndian<quint32>(input.constData());
            auto length = qFromLittleEndian<quint32>(input.constData() + 4);
            if (length > 65536) {
                socket.abort();
                return;
            }
            if (input.size() < 8 + length)
                return;
            auto object = QJsonDocument::fromJson(input.mid(8, length)).object();
            input.remove(0, 8 + length);
            if (op == 3) {
                frame(4, object);
                continue;
            }
            if (op == 2) {
                socket.abort();
                return;
            }
            if (object["evt"] == "READY") {
                ready = true;
                setStatus("Подключено к Discord");
                publish();
            } else if (object["evt"] == "ERROR")
                setStatus("Discord отклонил статус. Проверьте Application ID");
        }
    });
}
void DiscordPresence::setStatus(QString text) {
    if (notice == text)
        return;
    notice = text;
    emit changed();
}
void DiscordPresence::configure(bool active, QString application) {
    if (active == enabled && application == id)
        return;
    if (ready)
        frame(1, {{"cmd", "SET_ACTIVITY"},
                  {"args",
                   QJsonObject{{"pid", QCoreApplication::applicationPid()}, {"activity", QJsonValue::Null}}},
                  {"nonce", QUuid::createUuid().toString()}});
    socket.abort();
    ready = false;
    enabled = active;
    id = application.trimmed();
    retry.stop();
    throttle.stop();
    if (!enabled) {
        setStatus("Выключено");
        return;
    }
    if (!QRegularExpression("^[0-9]{17,20}$").match(id).hasMatch()) {
        setStatus("Укажите Application ID Discord");
        return;
    }
    retry.start();
    throttle.start();
    connectPipe();
}
void DiscordPresence::connectPipe() {
    if (!enabled || socket.state() != QLocalSocket::UnconnectedState)
        return;
#ifdef Q_OS_WIN
    QString path = "discord-ipc-" + QString::number(pipe++ % 10);
#else
    QString base = qEnvironmentVariable("XDG_RUNTIME_DIR", QDir::tempPath());
    QString path = base + "/discord-ipc-" + QString::number(pipe++ % 10);
#endif
    socket.connectToServer(endpoint.isEmpty() ? path : endpoint);
}
void DiscordPresence::frame(quint32 op, QJsonObject object) {
    auto body = QJsonDocument(object).toJson(QJsonDocument::Compact);
    QByteArray bytes(8, 0);
    qToLittleEndian(op, bytes.data());
    qToLittleEndian(quint32(body.size()), bytes.data() + 4);
    socket.write(bytes + body);
}
void DiscordPresence::update(QVariantMap value, double at) {
    track = value;
    position = at;
}
void DiscordPresence::publish() {
    if (!ready)
        return;
    QJsonValue activity = QJsonValue::Null;
    if (track["playing"].toBool() && !track["title"].toString().isEmpty()) {
        QJsonObject item{{"type", 2},
                         {"details", track["title"].toString().left(128)},
                         {"state", track["artist"].toString().left(128)}};
        if (track["clockKnown"].toBool() && track["duration"].toDouble() > position) {
            auto now = QDateTime::currentSecsSinceEpoch();
            item["timestamps"] = QJsonObject{{"start", now - qint64(position)},
                                             {"end", now + qint64(track["duration"].toDouble() - position)}};
        }
        activity = item;
    }
    frame(1, {{"cmd", "SET_ACTIVITY"},
              {"args", QJsonObject{{"pid", QCoreApplication::applicationPid()}, {"activity", activity}}},
              {"nonce", QUuid::createUuid().toString()}});
}
