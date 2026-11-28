#pragma once
#include <QtCore>
namespace MusicData {
QString key(const QVariantMap &track);
bool soundCloud(const QUrl &url);
bool authUrl(const QUrl &url);
QVariantList lrc(const QString &text);
QVariantList importFile(const QByteArray &data, const QString &suffix, QString *error);
double match(const QVariantMap &source, const QVariantMap &candidate);
bool save(const QString &path, const QVariant &data);
QVariant load(const QString &path, const QVariant &fallback = {});
} // namespace MusicData
