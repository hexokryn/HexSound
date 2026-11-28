#pragma once
#include <QtCore>
#include <QtEndian>
inline bool safeZip(QString path) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly) || file.size() < 22)
        return false;
    auto read = [&](qint64 at, int size) {
        if (!file.seek(at))
            return QByteArray();
        return file.read(size);
    };
    auto u16 = [](QByteArray b, int at) { return qFromLittleEndian<quint16>(b.constData() + at); };
    auto u32 = [](QByteArray b, int at) { return qFromLittleEndian<quint32>(b.constData() + at); };
    auto tail = read(qMax<qint64>(0, file.size() - 65557), int(qMin<qint64>(65557, file.size())));
    int end = tail.lastIndexOf(QByteArray::fromHex("504b0506"));
    if (end < 0 || tail.size() - end < 22)
        return false;
    auto e = tail.mid(end);
    int count = u16(e, 10);
    quint64 offset = u32(e, 16);
    if (!count || count > 15000 || u16(e, 4) || u16(e, 6) || u16(e, 8) != count ||
        e.size() != 22 + u16(e, 20) || offset >= quint64(file.size()))
        return false;
    quint64 total = 0;
    QSet<QString> paths;
    auto extras = [&](QByteArray extra) {
        while (!extra.isEmpty()) {
            if (extra.size() < 4)
                return false;
            auto type = u16(extra, 0), size = u16(extra, 2);
            if (size > extra.size() - 4 || (type != 0x5455 && type != 0x000a))
                return false;
            extra.remove(0, 4 + size);
        }
        return true;
    };
    for (int i = 0; i < count; i++) {
        auto h = read(offset, 46);
        if (h.size() != 46 || u32(h, 0) != 0x02014b50)
            return false;
        int nameLen = u16(h, 28), extraLen = u16(h, 30), comment = u16(h, 32);
        auto name = read(offset + 46, nameLen);
        if (name.size() != nameLen || name.isEmpty() || name.contains('\0') || (u16(h, 8) & 1) ||
            (u16(h, 10) != 0 && u16(h, 10) != 8))
            return false;
        if (!(u16(h, 8) & 0x800))
            for (auto c : name)
                if (quint8(c) > 127)
                    return false;
        QString relative = QString::fromUtf8(name).replace('\\', '/');
        if (relative.startsWith('/') || relative.contains(QRegularExpression("[:<>\"|?*]")))
            return false;
        auto parts = relative.split('/', Qt::SkipEmptyParts);
        if (parts.isEmpty())
            return false;
        for (auto part : parts)
            if (part == "." || part == ".." || part.trimmed() != part || part.endsWith('.') ||
                QRegularExpression("^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\\.|$)",
                                   QRegularExpression::CaseInsensitiveOption)
                    .match(part)
                    .hasMatch())
                return false;
        QString key = relative.toCaseFolded();
        if (paths.contains(key))
            return false;
        paths.insert(key);
        quint32 attributes = u32(h, 38), mode = (attributes >> 16) & 0xf000;
        if ((attributes & 0x400) || (mode && mode != 0x8000 && mode != 0x4000))
            return false;
        total += u32(h, 24);
        if (total > 2147483648ULL || u32(h, 24) == 0xffffffff ||
            !extras(read(offset + 46 + nameLen, extraLen)))
            return false;
        auto local = read(u32(h, 42), 30);
        if (local.size() != 30 || u32(local, 0) != 0x04034b50 || u16(local, 26) != nameLen ||
            read(quint64(u32(h, 42)) + 30, nameLen) != name ||
            !extras(read(quint64(u32(h, 42)) + 30 + nameLen, u16(local, 28))))
            return false;
        offset += 46 + nameLen + extraLen + comment;
    }
    return offset == quint64(u32(e, 16)) + u32(e, 12);
}
