#pragma once
#include <QtCore>
#include <QtNetwork>
#include <functional>
class Services : public QObject {
    Q_OBJECT
  public:
    explicit Services(QString directory, QObject *parent = nullptr);
    QString account() const {
        return profile.value("id").toString();
    }
    bool connected() const {
        return !token.isEmpty() && !account().isEmpty();
    }
    void connectAccount(QString client, QString secret);
    void importToken(QString value, QString refresh = {});
    void disconnectAccount();
    void preview(QVariantList tracks);
    void transfer(QString name, QVariantMap choices);
    void resume();
    void cancel();
    void request(QString path, QByteArray method, QVariant body, std::function<void(QVariant, QString)> done,
                 bool retried = false);
    QVariantList review;
    QString status;
    bool busy = false;
  signals:
    void changed();
    void message(QString text);

  protected:
    virtual QNetworkReply *send(const QNetworkRequest &request, const QByteArray &method, const QByteArray &body);

  private:
    QNetworkAccessManager network;
    QTcpServer listener;
    QString dir, token, refreshToken, clientId, clientSecret, authState, verifier;
    QVariantMap profile;
    int revision = 0;
    QSet<QNetworkReply *> requests;
    void saveToken();
    void fail(QString error);
    void append(QString playlist, QVariantList ids, int generation);
    bool refreshing = false;
    QList<std::function<void(bool)>> refreshWaiters;
    std::weak_ptr<std::function<void()>> activePreview;
    void refreshSession(std::function<void(bool)> done);
};
