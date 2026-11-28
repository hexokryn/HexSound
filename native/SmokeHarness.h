#pragma once
#include <QQuickWindow>
#include <QtCore>
#include <QtGui/QImage>
#include <QMouseEvent>
#include <cmath>
// Only exposed to trusted local QML; never to web content.
class SmokeHarness : public QObject {
    Q_OBJECT
  public:
    Q_INVOKABLE void movePointer(int x,int y){if(!window)return;QMouseEvent event(QEvent::MouseMove,QPointF(x,y),QPointF(window->mapToGlobal(QPoint(x,y))),Qt::NoButton,Qt::NoButton,Qt::NoModifier);QCoreApplication::sendEvent(window,&event);}
    QString output;
    QQuickWindow *window = nullptr;
    QJsonArray checks;
    bool failed = false;
    Q_INVOKABLE QString audioData() {
        QByteArray pcm(64000, '\x80');
        for (int i = 0; i < pcm.size(); i++)
            pcm[i] = char(128 + 12 * std::sin(i * .07));
        QByteArray wav;
        QDataStream stream(&wav, QIODevice::WriteOnly);
        stream.setByteOrder(QDataStream::LittleEndian);
        stream.writeRawData("RIFF", 4);
        stream << quint32(36 + pcm.size());
        stream.writeRawData("WAVEfmt ", 8);
        stream << quint32(16) << quint16(1) << quint16(1) << quint32(8000) << quint32(8000) << quint16(1)
               << quint16(8);
        stream.writeRawData("data", 4);
        stream << quint32(pcm.size());
        wav += pcm;
        return "data:audio/wav;base64," + QString::fromLatin1(wav.toBase64());
    }
    Q_INVOKABLE void check(bool condition, QString name) {
        checks.append(QJsonObject{{"name", name}, {"passed", condition}});
        failed |= !condition;
    }
    Q_INVOKABLE void capture(QString name) {
        if (window)
            check(window->grabWindow().save(output + "/" + name + ".png"), "screenshot " + name);
    }
    Q_INVOKABLE void finish() {
        const QStringList required{
            "Native control starts real audio", "Native volume controls audio",
            "Native control pauses audio", "Bridge reports real track",
            "SPA navigation keeps the same audio page"};
        for (const auto &name : required) {
            bool found = false;
            for (const auto &entry : checks)
                found |= entry.toObject().value("name").toString() == name;
            if (!found) check(false, "Missing result: " + name);
        }
        QFile report(output + "/report.json");
        if (report.open(QIODevice::WriteOnly))
            report.write(QJsonDocument(checks).toJson());
        if (window) {
            window->hide();
            window->releaseResources();
        }
        const int result = failed ? 2 : 0;
        // Give the render thread and WebEngine a turn to release their textures.
        QTimer::singleShot(200, QCoreApplication::instance(), [result] { QCoreApplication::exit(result); });
    }
};
