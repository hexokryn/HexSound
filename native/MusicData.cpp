#include "MusicData.h"
#include <algorithm>
namespace {
QString clean(QString s) {
    return s.normalized(QString::NormalizationForm_KC)
        .toLower()
        .replace(QRegularExpression("[^\\p{L}\\p{N}]+"), " ")
        .simplified();
}
QString edition(QString s) {
    QStringList out;
    auto i = QRegularExpression(
                 "remix|remaster(?:ed)?|live|acoustic|instrumental|cover|karaoke|sped.?up|slowed|radio.?edit",
                 QRegularExpression::CaseInsensitiveOption)
                 .globalMatch(s);
    while (i.hasNext())
        out << i.next().captured().toLower();
    out.sort();
    return out.join('|');
}
double seconds(QVariant value, bool ms = false) {
    QString s = value.toString().trimmed();
    if (s.isEmpty())
        return 0;
    double result = 0;
    bool ok = false;
    if (s.contains(':')) {
        auto parts = s.split(':');
        if (ms || parts.size() < 2 || parts.size() > 3)
            return -1;
        for (int i = 0; i < parts.size(); ++i) {
            double n = parts[i].toDouble(&ok);
            if (!ok || n < 0 || (i && n >= 60))
                return -1;
            result = result * 60 + n;
        }
    } else {
        result = s.replace(',', '.').toDouble(&ok);
        if (!ok)
            return -1;
        result /= ms ? 1000 : 1;
    }
    return result >= 0 && result <= 86400 ? result : -1;
}
QVariantMap normalize(const QVariantMap &m, QString *error) {
    QVariantMap t;
    t["title"] = m.value("title", m.value("name")).toString().trimmed().left(400);
    t["artist"] = m.value("artist").toString().trimmed().left(250);
    t["duration"] = seconds(m.value("duration"));
    if (t["title"].toString().isEmpty() || t["duration"].toDouble() < 0)
        *error = "У записи отсутствует название или неверная длительность";
    t["url"] = m.value("url");
    t["id"] = m.value("id");
    t["artwork"] = m.value("artwork");
    t["isrc"] = m.value("isrc").toString().trimmed().toUpper();
    return t;
}
} // namespace
QString MusicData::key(const QVariantMap &t) {
    return clean(t.value("title").toString()) + '|' + clean(t.value("artist").toString());
}
bool MusicData::soundCloud(const QUrl &u) {
    return u.scheme() == "https" && u.userInfo().isEmpty() &&
           (u.host() == "soundcloud.com" || u.host().endsWith(".soundcloud.com"));
}
bool MusicData::authUrl(const QUrl &u) {
    return soundCloud(u) ||
           (u.scheme() == "https" && u.userInfo().isEmpty() &&
            QStringList{"accounts.google.com", "appleid.apple.com", "www.facebook.com", "m.facebook.com"}
                .contains(u.host()));
}
QVariantList MusicData::lrc(const QString &text) {
    QVariantList lines;
    auto offsetMatch =
        QRegularExpression("\\[offset:([+-]?\\d+)\\]", QRegularExpression::CaseInsensitiveOption).match(text);
    double offset = offsetMatch.captured(1).toDouble() / 1000;
    for (const auto &line : text.left(500000).split('\n')) {
        auto stamps = QRegularExpression("\\[(\\d{1,3}):([0-5]\\d)(?:[.:](\\d{1,3}))?\\]").globalMatch(line);
        QString words = line;
        words.remove(QRegularExpression("\\[[^\\]]*\\]"));
        while (stamps.hasNext() && lines.size() < 3000) {
            auto m = stamps.next();
            lines.append(
                QVariantMap{{"time", qMax(0.0, m.captured(1).toDouble() * 60 + m.captured(2).toDouble() +
                                                   ("0." + m.captured(3)).toDouble() - offset)},
                            {"text", words.trimmed()}});
        }
    }
    std::stable_sort(lines.begin(), lines.end(), [](auto a, auto b) {
        return a.toMap()["time"].toDouble() < b.toMap()["time"].toDouble();
    });
    return lines;
}
bool MusicData::save(const QString &p, const QVariant &v) {
    QDir().mkpath(QFileInfo(p).absolutePath());
    QSaveFile f(p);
    if (!f.open(QIODevice::WriteOnly))
        return false;
    f.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    f.write(QJsonDocument::fromVariant(v).toJson(QJsonDocument::Compact));
    return f.commit();
}
QVariant MusicData::load(const QString &p, const QVariant &fallback) {
    QFile f(p);
    if (!f.open(QIODevice::ReadOnly) || f.size() > 64 * 1024 * 1024)
        return fallback;
    QJsonParseError e;
    auto d = QJsonDocument::fromJson(f.readAll(), &e);
    return e.error == QJsonParseError::NoError ? d.toVariant() : fallback;
}
QVariantList MusicData::importFile(const QByteArray &bytes, const QString &suffix, QString *error) {
    error->clear();
    QVariantList out;
    if (bytes.size() > 10 * 1024 * 1024) {
        *error = "Файл больше 10 МБ";
        return out;
    }
    QString text = QString::fromUtf8(bytes);
    if (text.startsWith(QChar(0xfeff)))
        text.remove(0, 1);
    if (suffix.toLower() == "json") {
        QJsonParseError e;
        auto d = QJsonDocument::fromJson(text.toUtf8(), &e);
        if (e.error != QJsonParseError::NoError) {
            *error = "Некорректный JSON";
            return out;
        }
        QVariantList rows =
            d.isArray() ? d.toVariant().toList() : d.object()["tracks"].toArray().toVariantList();
        if (d.object().contains("providers"))
            for (auto value : d.object()["providers"].toObject())
                rows.append(value.toObject()["tracks"].toArray().toVariantList());
        for (auto row : rows) {
            out.append(normalize(row.toMap(), error));
            if (!error->isEmpty())
                return {};
        }
    } else {
        int comma = 0, semi = 0, tab = 0;
        bool quoted = false;
        for (auto c : text) {
            if (c == '"')
                quoted = !quoted;
            if (!quoted) {
                if (c == '\n')
                    break;
                if (c == ',')
                    comma++;
                if (c == ';')
                    semi++;
                if (c == '\t')
                    tab++;
            }
        }
        QChar delimiter = tab > qMax(comma, semi) ? '\t' : semi > comma ? ';' : ',';
        QList<QStringList> rows;
        QStringList row;
        QString cell;
        quoted = false;
        bool closed = false;
        for (qsizetype i = 0; i < text.size(); ++i) {
            auto c = text[i];
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < text.size() && text[i + 1] == '"') {
                        cell += '"';
                        i++;
                    } else {
                        quoted = false;
                        closed = true;
                    }
                } else
                    cell += c;
            } else if (c == delimiter) {
                row << cell;
                cell.clear();
                closed = false;
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.size() && text[i + 1] == '\n')
                    i++;
                row << cell;
                if (!row.join("").trimmed().isEmpty())
                    rows << row;
                row.clear();
                cell.clear();
                closed = false;
            } else if (c == '"' && cell.trimmed().isEmpty() && !closed) {
                quoted = true;
                cell.clear();
            } else if (closed && !c.isSpace()) {
                *error = "Ошибка кавычек CSV";
                return {};
            } else
                cell += c;
            if (cell.size() > 4096 || row.size() > 100 || rows.size() > 50001) {
                *error = "Превышены ограничения CSV";
                return {};
            }
        }
        if (quoted) {
            *error = "Не закрыта кавычка CSV";
            return {};
        }
        if (!cell.isEmpty() || !row.isEmpty()) {
            row << cell;
            rows << row;
        }
        if (rows.size() < 2) {
            *error = "В файле нет записей";
            return {};
        }
        auto headers = rows.takeFirst();
        for (auto &h : headers)
            h = clean(h);
        auto column = [&](QStringList aliases) {
            for (int i = 0; i < headers.size(); ++i)
                if (aliases.contains(headers[i]))
                    return i;
            return -1;
        };
        int title = column({"title", "name", "track name", "название", "название трека", "трек"}),
            artist = column({"artist", "artist name", "artist names", "исполнитель"}),
            duration = column({"duration", "length", "длительность"}),
            ms = column({"duration ms", "track duration ms", "длительность мс"});
        if (title < 0 || (duration >= 0 && ms >= 0)) {
            *error = "Нужен title и одна колонка длительности";
            return {};
        }
        for (auto r : rows) {
            if (r.size() != headers.size()) {
                *error = "Неодинаковое число колонок CSV";
                return {};
            }
            auto get = [&](int i) { return i >= 0 ? r[i] : QString(); };
            double time = seconds(get(ms >= 0 ? ms : duration), ms >= 0);
            if (time < 0) {
                *error = "Неверная длительность";
                return {};
            }
            out.append(
                normalize({{"title", get(title)}, {"artist", get(artist)}, {"duration", time}}, error));
            if (!error->isEmpty())
                return {};
        }
    }
    if (out.isEmpty() || out.size() > 50000) {
        *error = "Допустимо от 1 до 50 000 записей";
        return {};
    }
    return out;
}
double MusicData::match(const QVariantMap &a, const QVariantMap &b) {
    const QString isrc = a.value("isrc").toString(), otherIsrc = b.value("isrc").toString();
    if (!isrc.isEmpty() && !otherIsrc.isEmpty() && isrc.compare(otherIsrc, Qt::CaseInsensitive) != 0)
        return 0;
    if (edition(a["title"].toString()) != edition(b["title"].toString()))
        return 0;
    auto similarity = [](QString a, QString b) {
        auto x = clean(a).split(' ', Qt::SkipEmptyParts), y = clean(b).split(' ', Qt::SkipEmptyParts);
        QSet<QString> xx(x.begin(), x.end()), yy(y.begin(), y.end());
        int total = xx.size() + yy.size();
        return total ? 2.0 * (xx & yy).size() / total : 0;
    };
    double title = similarity(a["title"].toString(), b["title"].toString()),
           artist = similarity(a["artist"].toString(), b["artist"].toString()),
           duration = a["duration"].toDouble(), other = b["duration"].toDouble();
    if (title < .65 || artist < .65 ||
        (duration > 0 && other > 0 && qAbs(duration - other) > qMax(3.0, qMin(8.0, duration * .025))))
        return 0;
    double score = .5 * title + .35 * artist + .15;
    if (duration <= 0 || other <= 0)
        score = qMin(.86, score);
    return score;
}
