#include <QtTest>
#include "../Controller.h"
#include "../MusicData.h"
#include "FakeApi.h"
class ControllerTest : public QObject {
    Q_OBJECT
  private slots:
    void cancelledPreviewReleasesInput() {
        QTemporaryDir dir;FakeApi api(dir.path());
        api.replies.append({200,QVariantMap{{"id",17},{"username","Fixture"}}});
        api.importToken("fixture-token");QTRY_VERIFY(api.connected());
        auto marker=QSharedPointer<QObject>::create();QWeakPointer<QObject> weak(marker);
        QVariantList tracks{QVariantMap{{"title","Fixture"},{"artist","Fixture"},{"probe",QVariant::fromValue(marker)}}};
        api.preview(tracks);tracks.clear();marker.clear();api.cancel();
        QTRY_VERIFY(weak.isNull());QVERIFY(!api.busy);
    }
    void logoutWaitsForStorageClear() {
        QTemporaryDir dir;Controller backend(dir.path());QSignalSpy reset(&backend,&Controller::logoutRequested);
        backend.logout();QCOMPARE(reset.size(),0);backend.receive("logout",true);QCOMPARE(reset.size(),1);
    }
    void apiValidationAndReplacement() {
        QTemporaryDir dir;FakeApi api(dir.path());
        api.replies.append({200,QVariantMap{{"id",17},{"urn",QVariant()},{"username","Fixture"}}});
        api.importToken("fixture-token");QVERIFY(api.busy);QVERIFY(!api.connected());
        QTRY_VERIFY(api.connected());QVERIFY(!api.busy);QCOMPARE(api.account(),QString("17"));
        api.replies.append({403,QVariantMap{}});api.importToken("invalid-fixture");
        QVERIFY(!api.connected());QTRY_VERIFY(!api.busy);QVERIFY(!api.connected());
        Services reopened(dir.path());QVERIFY(!reopened.connected());
    }
    void incompleteDestinationNeverWritten() {
        QTemporaryDir dir;FakeApi api(dir.path());
        api.replies.append({200,QVariantMap{{"id",17},{"username","Fixture"}}});
        api.importToken("fixture-token");QTRY_VERIFY(api.connected());
        MusicData::save(dir.filePath("transfer-journal.json"),QVariantMap{{"account","17"},{"playlist","21"},{"status","writing"},{"ids",QVariantList{"soundcloud:tracks:7"}}});
        api.replies.append({200,QVariantMap{{"user",QVariantMap{{"id",17}}}}});
        api.resume();QTRY_VERIFY(!api.busy);QVERIFY(!api.methods.contains("PUT"));
        QCOMPARE(MusicData::load(dir.filePath("transfer-journal.json")).toMap()["status"].toString(),QString("writing"));
    }
    void resumedTransferPreservesTracks() {
        QTemporaryDir dir;FakeApi api(dir.path());
        api.replies.append({200,QVariantMap{{"id",17},{"username","Fixture"}}});
        api.importToken("fixture-token");QTRY_VERIFY(api.connected());
        MusicData::save(dir.filePath("transfer-journal.json"),QVariantMap{{"account","17"},{"playlist","21"},{"status","writing"},{"ids",QVariantList{"soundcloud:tracks:7","soundcloud:tracks:8"}}});
        api.replies.append({200,QVariantMap{{"user",QVariantMap{{"id",17}}},{"track_count",1},{"tracks",QVariantList{QVariantMap{{"id",7}}}}}});
        api.replies.append({200,QVariantMap{}});api.resume();QTRY_VERIFY(!api.busy);
        QCOMPARE(api.methods.count("PUT"),1);
        auto tracks=api.bodies.last().toMap()["playlist"].toMap()["tracks"].toList();
        QCOMPARE(tracks.size(),2);QCOMPARE(tracks.first().toMap()["urn"].toString(),QString("soundcloud:tracks:7"));
        QCOMPARE(MusicData::load(dir.filePath("transfer-journal.json")).toMap()["status"].toString(),QString("complete"));
    }
    void volumeCoalescing() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        Controller backend(dir.path());
        backend.receive("snapshot", QVariantMap{{"track", QVariantMap{{"available", true}, {"volume", 1}}}});
        backend.receive("volume", true);
        QSignalSpy commands(&backend, &Controller::javascriptRequested);
        backend.control("volume", .2);
        backend.control("volume", .3);
        backend.control("volume", .4);
        QCOMPARE(commands.size(), 1);
        QCOMPARE(backend.volume(), .4);
        backend.receive("snapshot", QVariantMap{{"track", QVariantMap{{"volume", 1}}}});
        QCOMPARE(backend.volume(), .4);
        backend.receive("volume", true);
        QCOMPARE(commands.size(), 2);
        QVERIFY(commands.last()[0].toString().contains("0.4"));
        backend.receive("volume", true);
        QTRY_COMPARE(MusicData::load(dir.filePath("preferences.json")).toMap()["volume"].toDouble(), .4);
    }
    void playerClock() {
        QTemporaryDir dir;
        Controller backend(dir.path());
        QVariantMap track{
            {"title", "Test"}, {"duration", 100}, {"position", 5}, {"playing", true}, {"clockKnown", true}};
        backend.receive("snapshot", QVariantMap{{"track", track}});
        QTest::qWait(110);
        QVERIFY(backend.position() >= 5.09 && backend.position() < 5.5);
        track["clockKnown"] = false;
        backend.receive("snapshot", QVariantMap{{"track", track}});
        QTest::qWait(50);
        QCOMPARE(backend.position(), 5.0);
        track["playing"] = false;
        backend.receive("snapshot", QVariantMap{{"track", track}});
        QTest::qWait(50);
        QCOMPARE(backend.position(), 5.0);
    }
    void waveGeneration() {
        QTemporaryDir dir;
        Controller backend(dir.path());
        QSignalSpy workers(&backend, &Controller::workerRequested);
        backend.receive(
            "snapshot",
            QVariantMap{{"profile",
                         QVariantMap{{"loggedIn", true}, {"url", "https://soundcloud.com/test-account"}}}});
        backend.startWave();
        QCOMPARE(workers.size(), 1);
        QString ticket = workers.first()[1].toString();
        backend.stopWave();
        backend.workerResult(
            ticket, {{"rows", QVariantList{QVariantMap{{"title", "Test"},
                                                       {"artist", "Artist"},
                                                       {"url", "https://soundcloud.com/artist/test"}}}}});
        QVERIFY(backend.wave().isEmpty());
        QVERIFY(!backend.radio());
    }
    void settingsBounds() {
        QTemporaryDir dir;
        Controller backend(dir.path());
        backend.configure("scale", 999);
        QCOMPARE(backend.settings()["scale"].toInt(), 125);
        backend.configure("mode", "invalid");
        QCOMPARE(backend.settings()["mode"].toString(), QString("dark"));
        backend.configure("unknown", true);
        QVERIFY(!backend.settings().contains("unknown"));
    }
    void waveBalancesDiscoveries() {
        QTemporaryDir dir;
        Controller backend(dir.path());
        backend.receive("snapshot",
                        QVariantMap{{"profile", QVariantMap{{"loggedIn", true}, {"id", "test-account"}}}});
        QSignalSpy workers(&backend, &Controller::workerRequested);
        backend.startWave();
        QVariantList likes;
        for (int i = 0; i < 3; i++)
            likes.append(QVariantMap{{"title", QString("Like %1").arg(i)},
                                     {"artist", "Artist"},
                                     {"url", QString("https://soundcloud.com/artist/like-%1").arg(i)}});
        backend.workerResult(workers.first()[1].toString(), {{"rows", likes}});
        QVERIFY(workers.size() >= 2);
        backend.workerResult(
            workers.last()[1].toString(),
            {{"rows", QVariantList{QVariantMap{{"title", "Discovery"},
                                               {"artist", "Artist"},
                                               {"url", "https://soundcloud.com/artist/discovery"}}}}});
        QCOMPARE(backend.wave().size(), 4);
        QCOMPARE(backend.wave()[2].toMap()["title"].toString(), QString("Discovery"));
        backend.stopWave();
    }
    void apiOrigins() {
        QTemporaryDir dir;
        Services api(dir.path());
        bool called = false;
        api.request("https://api.soundcloud.com.evil.test/me", "GET", {}, [&](QVariant, QString error) {
            called = true;
            QVERIFY(!error.isEmpty());
        });
        QVERIFY(called);
        api.preview({});
        QVERIFY(!api.busy);
        QVERIFY(!api.status.isEmpty());
    }
    void unknownTransferIsNotResumed() {
        QTemporaryDir dir;
        Services api(dir.path());
        MusicData::save(dir.filePath("transfer-journal.json"),
                        QVariantMap{{"status", "creating"}, {"ids", QVariantList{"soundcloud:tracks:123"}}});
        api.resume();
        QVERIFY(!api.busy);
        QVERIFY(!api.status.isEmpty());
        QVERIFY(MusicData::load(dir.filePath("transfer-journal.json")).toMap()["status"] == "creating");
    }
};
QTEST_GUILESS_MAIN(ControllerTest)
#include "tst_controller.moc"
