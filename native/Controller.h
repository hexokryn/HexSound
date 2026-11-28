#pragma once
#include "Services.h"
#include "DiscordPresence.h"
#include <QtCore>
#include <QtNetwork>
#include <optional>
class Controller : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantMap settings READ settings NOTIFY changed)
    Q_PROPERTY(QVariantMap track READ track NOTIFY changed)
    Q_PROPERTY(QVariantMap profile READ profile NOTIFY changed)
    Q_PROPERTY(QVariantMap colors READ colors NOTIFY changed)
    Q_PROPERTY(QVariantList palettes READ palettes CONSTANT)
    Q_PROPERTY(QVariantList lyrics READ lyrics NOTIFY changed)
    Q_PROPERTY(QVariantList wave READ wave NOTIFY changed)
    Q_PROPERTY(QVariantList imports READ imports NOTIFY changed)
    Q_PROPERTY(QVariantList review READ review NOTIFY changed)
    Q_PROPERTY(QString page READ page NOTIFY changed)
    Q_PROPERTY(QString status READ status NOTIFY changed)
    Q_PROPERTY(QString lyricStatus READ lyricStatus NOTIFY changed)
    Q_PROPERTY(QString updateStatus READ updateStatus NOTIFY changed)
    Q_PROPERTY(QString rpcStatus READ rpcStatus NOTIFY changed)
    Q_PROPERTY(QString apiStatus READ apiStatus NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool radio READ radio NOTIFY changed)
    Q_PROPERTY(bool apiConnected READ apiConnected NOTIFY changed)
    Q_PROPERTY(double position READ position NOTIFY positionChanged)
    Q_PROPERTY(double volume READ volume NOTIFY changed)
    Q_PROPERTY(QString version READ version CONSTANT)
    Q_PROPERTY(bool updateAvailable READ updateAvailable NOTIFY changed)
    Q_PROPERTY(bool updateReady READ updateReady NOTIFY changed)
    Q_PROPERTY(QString releaseNotes READ releaseNotes NOTIFY changed)
    Q_PROPERTY(QString collector READ collector CONSTANT)
    Q_PROPERTY(QString dataDirectory READ dataDirectory CONSTANT)
  public:
    explicit Controller(QString directory = {}, QObject *parent = nullptr);
    QString dataDirectory() const {
        return dir;
    }
    QVariantMap settings() const {
        return config;
    }
    QVariantMap track() const {
        return current;
    }
    QVariantMap profile() const {
        return user;
    }
    QVariantMap colors() const;
    QVariantList palettes() const {
        return themes;
    }
    QVariantList lyrics() const {
        return lines;
    }
    QVariantList wave() const {
        return recommendations;
    }
    QVariantList imports() const {
        return imported;
    }
    QVariantList review() const {
        return api.review;
    }
    QString page() const {
        return screen;
    }
    QString status() const {
        return notice;
    }
    QString lyricStatus() const {
        return lyricNotice;
    }
    QString rpcStatus() const {return discord.status();}
    QString apiStatus() const {
        return api.status;
    }
    QString updateStatus() const {
        return updateNotice;
    }
    bool busy() const {
        return working || api.busy;
    }
    bool radio() const {
        return radioActive;
    }
    bool apiConnected() const {
        return api.connected();
    }
    double position() const;
    double volume() const {
        return soundVolume;
    }
    QString version() const {
        return HEXSOUND_VERSION;
    }
    QString collector() const;
    Q_INVOKABLE bool allowed(QUrl url, bool auth = false) const;
    bool updateAvailable() const {
        return !updateAsset.isEmpty() && !updateReply;
    }
    bool updateReady() const {
        return !downloaded.isEmpty() && QFile::exists(downloaded) && !updateReply;
    }
    QString releaseNotes() const {
        return notes;
    }
    Q_INVOKABLE QString injection() const;
    Q_INVOKABLE void navigate(QString route);
    Q_INVOKABLE void show(QString page);
    Q_INVOKABLE void search(QString query);
    Q_INVOKABLE void configure(QString key, QVariant value);
    Q_INVOKABLE void control(QString action, double value = 0);
    Q_INVOKABLE void receive(QString ticket, QVariant result);
    Q_INVOKABLE void poll();
    Q_INVOKABLE void startWave();
    Q_INVOKABLE void stopWave();
    Q_INVOKABLE void feedback(QString action);
    Q_INVOKABLE void playWave(int row);
    Q_INVOKABLE void workerResult(QString ticket, QVariantMap data);
    Q_INVOKABLE void workerError(QString ticket, QString error);
    Q_INVOKABLE void openLyrics();
    Q_INVOKABLE void importLyrics();
    Q_INVOKABLE void importMusic();
    Q_INVOKABLE void previewImport();
    Q_INVOKABLE void commitImport(QString name, QVariantMap choices);
    Q_INVOKABLE void resumeImport();
    Q_INVOKABLE void connectApi(QString client, QString secret);
    Q_INVOKABLE void tokenApi(QString token);
    Q_INVOKABLE void disconnectApi();
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void checkUpdates();
    Q_INVOKABLE void downloadUpdate();
    Q_INVOKABLE void installUpdate();
    Q_INVOKABLE void chooseBackground();
    Q_INVOKABLE void notify(QString text);
    Q_INVOKABLE void logout() {
        stopWave();
        emit javascriptRequested("(()=>{localStorage.clear();sessionStorage.clear();return true})()","logout");
    }
  signals:
    void changed();
    void positionChanged();
    void javascriptRequested(QString script, QString ticket);
    void navigationRequested(QUrl url);
    void workerRequested(QUrl url, QString ticket);
    void workerStopped();
    void logoutRequested();
    void reloadRequested(QUrl url);

  private:
    QString dir;
    QVariantMap config, current, user, ratings;
    QVariantList themes, lines, library, recommendations, imported;
    QString screen = "music", notice, lyricNotice, updateNotice, notes, workerPending, libraryOwner;
    Services api;
    DiscordPresence discord;
    QNetworkAccessManager network;
    QElapsedTimer clock;
    bool working = false, radioActive = false, polling = false, volumeBusy = false, volumeReady = false;
    double soundVolume = 1;
    std::optional<double> pendingVolume;
    int lyricGeneration = 0, waveGeneration = 0, waveCursor = -1, playAttempts = 0;
    qint64 endedAt = 0;
    QString playingUrl;
    QTimer playTimer, preferenceSaveTimer;
    QVariantMap updateAsset;
    bool checkingUpdates=false;
    QString downloaded;
    QNetworkReply *updateReply = nullptr;
    void loadLyrics();
    void collectWave(QString stage);
    void appendWave(QVariantList tracks);
    void nextWave();
    void sendVolume();
    void github(QUrl url, std::function<void(QByteArray, QString)> done, int redirects = 0);
};
