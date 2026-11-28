#pragma once
#include <QtCore>
#include <QtNetwork/QLocalSocket>
class DiscordPresence : public QObject {
    Q_OBJECT
  public:
    explicit DiscordPresence(QObject *p = nullptr, QString endpoint = {});
    void configure(bool enabled, QString application);
    void update(QVariantMap track, double position);
    QString status() const {
        return notice;
    }
  signals:
    void changed();

  private:
    QLocalSocket socket;
    QTimer retry, throttle;
    QByteArray input;
    QString id, notice, endpoint;
    QVariantMap track;
    double position = 0;
    bool enabled = false, ready = false;
    int pipe = 0;
    void connectPipe();
    void frame(quint32 op, QJsonObject object);
    void publish();
    void setStatus(QString text);
};
