#include <QtCore>
#include "ZipCheck.h"
#ifdef Q_OS_WIN
#include <windows.h>
#endif
static bool copyAtomic(QString from, QString to) {
    QFile in(from);
    if (!in.open(QIODevice::ReadOnly))
        return false;
    QDir().mkpath(QFileInfo(to).absolutePath());
    QSaveFile out(to);
    if (!out.open(QIODevice::WriteOnly))
        return false;
    while (!in.atEnd()) {
        auto data = in.read(1024 * 1024);
        if (data.isEmpty() && in.error() != QFile::NoError)
            return false;
        if (out.write(data) != data.size())
            return false;
    }
    return out.commit();
}
int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    auto args = app.arguments();
    if (args.size() < 2 || args.size() > 3)
        return 1;
    bool verifyOnly = args.size() == 3 && args[2] == "--verify-only";
    if (args.size() == 3 && !verifyOnly)
        return 1;
    QFile jobFile(args[1]);
    if (!jobFile.open(QIODevice::ReadOnly))
        return 2;
    auto job = QJsonDocument::fromJson(jobFile.readAll()).object();
    QString zip = job["archive"].toString(), target = QDir(job["target"].toString()).canonicalPath();
    QStringList restartArgs;
    if(!job["dataDirectory"].toString().isEmpty())restartArgs={"--data-dir",job["dataDirectory"].toString()};
    auto waitParent = [&]() {
#ifdef Q_OS_WIN
        HANDLE process = OpenProcess(SYNCHRONIZE, FALSE, DWORD(job["pid"].toInteger()));
        if (process) {
            auto result = WaitForSingleObject(process, 120000);
            CloseHandle(process);
            return result == WAIT_OBJECT_0;
        }
#endif
        return true;
    };
    auto fail = [&](QString why, bool restart=true) {
        QFile log(QFileInfo(args[1]).absolutePath() + "/update-error.txt");
        if (log.open(QIODevice::WriteOnly))
            log.write(why.toUtf8());
        if (!verifyOnly && restart && QFile::exists(target + "/HexSound.exe") && waitParent())
            QProcess::startDetached(target + "/HexSound.exe", restartArgs+QStringList{"--update-error"});
        return 3;
    };
    QFile archive(zip);
    if (target.isEmpty() || !QFile::exists(target + "/HexSound.exe") || !archive.open(QIODevice::ReadOnly))
        return fail("Invalid update job");
    QCryptographicHash hash(QCryptographicHash::Sha256);
    hash.addData(&archive);
    if (archive.size() != qint64(job["size"].toDouble()) ||
        QString::fromLatin1(hash.result().toHex()) != job["sha256"].toString())
        return fail("Archive verification failed");
    archive.close();
    QTemporaryDir staging(QFileInfo(args[1]).absolutePath() + "/stage-XXXXXX");
    if (!staging.isValid())
        return fail("No staging directory");
    if (!safeZip(zip))
        return fail("Unsafe ZIP layout");
    QString extracted = staging.path() + "/payload";
    QDir().mkpath(extracted);
    QProcess unpack;
#ifdef Q_OS_WIN
    unpack.setCreateProcessArgumentsModifier([](QProcess::CreateProcessArguments *args){args->flags|=CREATE_NO_WINDOW;});
#endif
    unpack.start(qEnvironmentVariable("SystemRoot") + "/System32/tar.exe", {"-xf", zip, "-C", extracted});
    if (!unpack.waitForFinished(120000) || unpack.exitCode() != 0)
        return fail("Archive extraction failed");
    QString source = extracted;
    if (!QFile::exists(source + "/HexSound.exe")) {
        auto dirs = QDir(source).entryList(QDir::Dirs | QDir::NoDotAndDotDot);
        if (dirs.size() != 1)
            return fail("Invalid archive layout");
        source += "/" + dirs.first();
    }
    if (!QFile::exists(source + "/HexSound.exe") || !QFile::exists(source + "/HexSoundUpdate.exe"))
        return fail("Missing application files");
    QStringList files;
    QDirIterator it(source, QDir::Files | QDir::Hidden, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        auto p = it.next();
        QFileInfo info(p);
        QString relative = QDir(source).relativeFilePath(p);
        auto top = relative.section('/', 0, 0).toLower();
        if (info.isSymLink() || !info.canonicalFilePath().startsWith(QDir(source).canonicalPath() + "/"))
            return fail("Unsafe payload");
        if (QStringList{"data", "web", "cache"}.contains(top) || relative.compare("portable",Qt::CaseInsensitive)==0)
            continue;
        QString destination = target + "/" + relative;
        QFileInfo existing(destination);
        if (existing.isSymLink())
            return fail("Linked destination");
        QString parent = QFileInfo(destination).absolutePath();
        while (!QFileInfo(parent).exists())
            parent = QFileInfo(parent).absolutePath();
        if (QFileInfo(parent).canonicalFilePath() != target &&
            !QFileInfo(parent).canonicalFilePath().startsWith(target + "/"))
            return fail("Outside target");
        files << relative;
    }
    if (verifyOnly)
        return 0;
    files.sort(Qt::CaseInsensitive);
#ifdef Q_OS_WIN
    HANDLE parent = OpenProcess(SYNCHRONIZE, FALSE, DWORD(job["pid"].toInteger()));
    if (parent) {
        auto wait = WaitForSingleObject(parent, 120000);
        CloseHandle(parent);
        if (wait != WAIT_OBJECT_0)
            return fail("Application did not stop",false);
    }
#endif
    QString backup = staging.path() + "/backup";
    auto record=[&](QString status,QString detail){
        QJsonObject result{{"status",status},{"detail",detail},{"backup",backup},{"time",QDateTime::currentDateTimeUtc().toString(Qt::ISODate)}};
        QSaveFile journal(QFileInfo(args[1]).absolutePath()+"/result.json");
        if(journal.open(QIODevice::WriteOnly)){journal.write(QJsonDocument(result).toJson());journal.commit();}
    };
    QStringList written, newFiles;
    for (auto relative : files)
        if (QFile::exists(target + "/" + relative) &&
            !copyAtomic(target + "/" + relative, backup + "/" + relative))
            return fail("Backup failed");
    staging.setAutoRemove(false); // Preserve recovery files if a replacement or rollback fails.
    record("replacing",{});
    for (auto relative : files) {
        QString destination = target + "/" + relative;
        bool exists = QFile::exists(destination);
        bool copied=false;QElapsedTimer retry;retry.start();
        do {copied=copyAtomic(source+"/"+relative,destination);if(!copied)QThread::msleep(100);}while(!copied&&retry.elapsed()<8000);
        if (!copied) {
            bool restored=true;
            for (auto entry=written.crbegin();entry!=written.crend();++entry) {
                const auto &r=*entry;
                if (newFiles.contains(r))
                    restored=QFile::remove(target+"/"+r)&&restored;
                else
                    restored=copyAtomic(backup+"/"+r,target+"/"+r)&&restored;
            }
            record(restored?"rolled-back":"recovery-required",relative);
            if(!restored){
#ifdef Q_OS_WIN
                QString message="Не удалось восстановить все файлы. Резервная копия сохранена:\n"+backup;
                MessageBoxW(nullptr,reinterpret_cast<LPCWSTR>(message.utf16()),L"HexSound",MB_OK|MB_ICONERROR);
#endif
                return fail("Recovery required: "+backup,false);
            }
            return fail("Update rolled back");
        }
        written << relative;
        if (!exists)
            newFiles << relative;
    }
    record("complete",{});
    if (!QProcess::startDetached(target + "/HexSound.exe", restartArgs))
        return fail("Files updated; restart failed");
    staging.setAutoRemove(true);
    return 0;
}
