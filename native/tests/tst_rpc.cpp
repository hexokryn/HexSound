#include <QtTest>
#include <QLocalServer>
#include <QtEndian>
#include "../DiscordPresence.h"
class RpcTest : public QObject {
    Q_OBJECT
  private slots:
    void localProtocol() {
        QLocalServer server;
        QString name = "hexsound-rpc-fixture-" + QString::number(QCoreApplication::applicationPid());
        QVERIFY(server.listen(name));
        DiscordPresence rpc(nullptr, name);
        rpc.configure(true, "");
        QVERIFY(rpc.status().contains("Application ID"));
        QVERIFY(!server.hasPendingConnections());
        rpc.configure(true, "100000000000000000");
        QTRY_VERIFY(server.hasPendingConnections());
        auto socket = server.nextPendingConnection();
        QTRY_VERIFY(socket->bytesAvailable() >= 8);
        QByteArray handshake = socket->readAll();
        QCOMPARE(qFromLittleEndian<quint32>(handshake.constData()), quint32(0));
        QCOMPARE(QJsonDocument::fromJson(handshake.mid(8)).object()["client_id"].toString(),
                 QString("100000000000000000"));
        auto send = [&](quint32 op, QJsonObject obj) {
            auto body = QJsonDocument(obj).toJson(QJsonDocument::Compact);
            QByteArray b(8, 0);
            qToLittleEndian(op, b.data());
            qToLittleEndian(quint32(body.size()), b.data() + 4);
            socket->write(b.left(3));
            socket->flush();
            QTest::qWait(10);
            socket->write(b.mid(3) + body);
            socket->flush();
        };
        rpc.update({{"title", "Track"},
                    {"artist", "Artist"},
                    {"playing", true},
                    {"duration", 180},
                    {"clockKnown", true}},
                   10);
        send(1, {{"evt", "READY"}});
        QTRY_VERIFY(socket->bytesAvailable() > 8);
        auto activity = QJsonDocument::fromJson(socket->readAll().mid(8))
                            .object()["args"]
                            .toObject()["activity"]
                            .toObject();
        QCOMPARE(activity["type"].toInt(), 2);
        QCOMPARE(activity["details"].toString(), QString("Track"));
        QVERIFY(activity.contains("timestamps"));
        send(3, {{"ping", 42}});
        QTRY_VERIFY(socket->bytesAvailable() > 8);
        QCOMPARE(qFromLittleEndian<quint32>(socket->readAll().constData()), quint32(4));
        rpc.configure(false, "");
        QCOMPARE(rpc.status(), QString("Выключено"));
        socket->deleteLater();
    }
};
QTEST_GUILESS_MAIN(RpcTest)
#include "tst_rpc.moc"
