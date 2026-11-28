#include "Controller.h"
#include "SmokeHarness.h"
#include <QApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QQuickWebEngineProfile>
#include <QWebEngineCookieStore>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>
int main(int argc, char **argv) {
#if defined(Q_OS_WIN) && QT_VERSION == QT_VERSION_CHECK(6, 8, 3)
    // Qt 6.8.3's Chromium/D3D texture sharing loses its context during resize
    // on the verified Windows host. Keep native Qt Quick GPU rendering;
    // use software compositing only for the embedded website on this SDK.
    if (qEnvironmentVariable("HEXSOUND_WEBENGINE_ACCELERATION") != "on") {
        QByteArray flags = qgetenv("QTWEBENGINE_CHROMIUM_FLAGS");
        if (!flags.contains("--disable-gpu")) flags += " --disable-gpu";
        qputenv("QTWEBENGINE_CHROMIUM_FLAGS", flags.trimmed());
    }
#endif
    QtWebEngineQuick::initialize();
    QApplication app(argc, argv);
    app.setApplicationName("HexSoundNative");
    app.setApplicationDisplayName("HexSound");
    app.setWindowIcon(QIcon(":/native/assets/icon.png"));
    app.setApplicationVersion(HEXSOUND_VERSION);
    QQuickStyle::setStyle("Basic");
    const auto args = app.arguments();
    const int smokeIndex = args.indexOf("--smoke");
    SmokeHarness harness;
    if (smokeIndex >= 0) {
        harness.output = QDir(args.value(smokeIndex + 1, "artifacts/native-smoke")).absolutePath();
        QDir().mkpath(harness.output);
        qputenv("HEXSOUND_SMOKE_LOG", (harness.output + "/qt.log").toUtf8());
        qInstallMessageHandler([](QtMsgType, const QMessageLogContext &, const QString &message) {
            QFile log(QString::fromUtf8(qgetenv("HEXSOUND_SMOKE_LOG")));
            if (log.open(QIODevice::WriteOnly | QIODevice::Append)) {
                log.write(message.toUtf8());
                log.write("\n");
            }
        });
        QFile::remove(harness.output + "/report.json");
        QStandardPaths::setTestModeEnabled(true);
        app.setApplicationName("HexSoundSmoke-" + QString::number(QCoreApplication::applicationPid()));
    }
    QString dataDirectory;
    if (smokeIndex >= 0)
        dataDirectory = harness.output + "/data";
    else if (args.contains("--data-dir"))
        dataDirectory = QDir(args.value(args.indexOf("--data-dir") + 1)).absolutePath();
    else if (QFile::exists(app.applicationDirPath() + "/portable"))
        dataDirectory = app.applicationDirPath() + "/data";
    Controller backend(dataDirectory);
    if(args.contains("--update-error"))QTimer::singleShot(1500,&backend,[&backend]{backend.notify("Обновление не завершено. Предыдущая версия сохранена; попробуйте повторить загрузку");});
    QDir().mkpath(backend.dataDirectory() + "/web");
    QDir().mkpath(backend.dataDirectory() + "/cache");
    QQuickWebEngineProfile profile;
    profile.setPersistentStoragePath(backend.dataDirectory() + "/web");
    profile.setCachePath(backend.dataDirectory() + "/cache");
    profile.setStorageName("soundcloud-native");
    profile.setOffTheRecord(false);
    profile.setPersistentCookiesPolicy(QQuickWebEngineProfile::ForcePersistentCookies);
    profile.setHttpCacheMaximumSize(128 * 1024 * 1024);
    QObject::connect(&backend, &Controller::logoutRequested, &app, [&] {
        profile.cookieStore()->deleteAllCookies();
        QTimer::singleShot(250,&backend,[&backend]{emit backend.reloadRequested(QUrl("https://soundcloud.com/discover"));});
    });
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("Backend", &backend);
    engine.rootContext()->setContextProperty("SmokeOutput", harness.output);
    engine.rootContext()->setContextProperty("Harness", &harness);
    engine.rootContext()->setContextProperty("SoundCloudProfile", &profile);
    QObject::connect(&engine, &QQmlApplicationEngine::warnings, &app,
                     [&harness, smokeIndex](const QList<QQmlError> &errors) {
                         if (smokeIndex >= 0)
                             for (auto e : errors)
                                 harness.check(false, e.toString());
                     });
    engine.load(QUrl("qrc:/native/qml/Main.qml"));
    if (engine.rootObjects().isEmpty()) {
        if (smokeIndex >= 0) {
            harness.check(false, "QML root creation failed");
            harness.finish();
        }
        return 1;
    }
    harness.window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
    if (smokeIndex >= 0)
        QTimer::singleShot(45000, &app, [&] {
            harness.check(false, "Smoke timeout");
            harness.finish();
        });
    return app.exec();
}
