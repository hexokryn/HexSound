#pragma once
#include "../Services.h"
#include <cstring>

// A local in-memory transport: no requests reach SoundCloud or a private account.
class FakeReply : public QNetworkReply {
    QByteArray payload;
    qint64 cursor=0;
    bool completed=false;
public:
    FakeReply(QNetworkRequest request,int status,QVariant value,QObject *parent):QNetworkReply(parent),
        payload(QJsonDocument::fromVariant(value).toJson()) {
        setRequest(request);setUrl(request.url());
        setAttribute(QNetworkRequest::HttpStatusCodeAttribute,status);
        if(status>=400)setError(QNetworkReply::UnknownServerError,"Fixture response");
        open(QIODevice::ReadOnly|QIODevice::Unbuffered);
        QTimer::singleShot(0,this,[this]{finish();});
    }
    void finish(){if(completed)return;completed=true;setFinished(true);emit readyRead();emit finished();}
    void abort() override {setError(QNetworkReply::OperationCanceledError,"Cancelled");finish();}
    qint64 bytesAvailable()const override{return payload.size()-cursor+QNetworkReply::bytesAvailable();}
    bool isSequential()const override{return true;}
protected:
    qint64 readData(char *out,qint64 max) override {
        qint64 length=qMin(max,payload.size()-cursor);if(length<=0)return -1;
        std::memcpy(out,payload.constData()+cursor,size_t(length));cursor+=length;return length;
    }
};
class FakeApi : public Services {
public:
    using Services::Services;
    QList<QPair<int,QVariant>> replies;
    QStringList methods;
    QList<QVariant> bodies;
protected:
    QNetworkReply *send(const QNetworkRequest &request,const QByteArray &method,const QByteArray &body)override {
        methods.append(QString::fromLatin1(method));bodies.append(QJsonDocument::fromJson(body).toVariant());
        auto response=replies.isEmpty()?qMakePair(500,QVariant(QVariantMap{})):replies.takeFirst();
        return new FakeReply(request,response.first,response.second,this);
    }
};
