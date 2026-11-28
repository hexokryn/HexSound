#include "../MusicData.h"
#include <QtTest>
class MusicTest : public QObject {
    Q_OBJECT
  private slots:
    void csv() {
        QString error;
        auto rows =
            MusicData::importFile("title,artist,duration_ms\n\"A, B\",Artist,210500\n", "csv", &error);
        QVERIFY2(error.isEmpty(), qPrintable(error));
        QCOMPARE(rows.size(), 1);
        QCOMPARE(rows[0].toMap()["title"].toString(), QString("A, B"));
        QCOMPARE(rows[0].toMap()["duration"].toDouble(), 210.5);
    }
    void malformed() {
        QString error;
        QVERIFY(MusicData::importFile("title,artist\n\"never closes,x", "csv", &error).isEmpty());
        QVERIFY(!error.isEmpty());
    }
    void duration() {
        QString error;
        auto rows = MusicData::importFile("title;artist;duration\nTrack;Artist;3:20\n", "csv", &error);
        QVERIFY2(error.isEmpty(), qPrintable(error));
        QCOMPARE(rows[0].toMap()["duration"].toDouble(), 200.0);
        QVERIFY(MusicData::importFile("title,duration\nTrack,2:99", "csv", &error).isEmpty());
    }
    void timedLyrics() {
        auto lines = MusicData::lrc("[offset:200]\n[00:02.10][00:04.100]Word\n[00:01]First");
        QCOMPARE(lines.size(), 3);
        QCOMPARE(lines[0].toMap()["text"].toString(), QString("First"));
        QCOMPARE(lines[1].toMap()["time"].toDouble(), 1.9);
    }
    void matching() {
        QVariantMap a{{"title", "Example"}, {"artist", "Artist"}, {"duration", 200}};
        auto b = a;
        QVERIFY(MusicData::match(a, b) > .9);
        b["title"] = "Example (Remix)";
        QCOMPARE(MusicData::match(a, b), 0.0);
        b = a;
        b["duration"] = 250;
        QCOMPARE(MusicData::match(a, b), 0.0);
        b = a;
        a["duration"] = 0;
        QVERIFY(MusicData::match(a, b) < .9);
    }
    void origins() {
        QVERIFY(MusicData::soundCloud(QUrl("https://soundcloud.com/artist/track")));
        QVERIFY(!MusicData::soundCloud(QUrl("https://soundcloud.com.evil.test/")));
        QVERIFY(!MusicData::soundCloud(QUrl("https://x@soundcloud.com/")));
        QVERIFY(!MusicData::soundCloud(QUrl("file:///etc/passwd")));
        QVERIFY(MusicData::authUrl(QUrl("https://accounts.google.com/")));
    }
    void persistence() {
        QTemporaryDir directory;
        auto p = directory.filePath("nested/test.json");
        QVERIFY(MusicData::save(p, QVariantMap{{"hello", "world"}}));
        QCOMPARE(MusicData::load(p).toMap()["hello"].toString(), QString("world"));
    }
};
QTEST_GUILESS_MAIN(MusicTest)
#include "tst_music.moc"
