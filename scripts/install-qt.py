"""Install the release SDK from Qt's public, architecture-specific repositories.

Qt 6.12 separates WebEngine into Extensions. No account or credentials required.
Archive SHA-1 values come from the official HTTPS repository, as in Qt Installer.
"""
import argparse
import concurrent.futures
import hashlib
import os
import pathlib
import shutil
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET

VERSION = "6.12.1"
BASE = "https://download.qt.io/online/qtsdkrepository/"


def read(url):
    with urllib.request.urlopen(url, timeout=180) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=".tools/Qt")
    args = parser.parse_args()
    windows = sys.platform == "win32"
    host = "windows_x86" if windows else "linux_x64"
    arch = "win64_msvc2022_64" if windows else "linux_gcc_64"
    directory = "msvc2022_64" if windows else "gcc_64"
    suffix = "_msvc2022_64" if windows else ""
    repositories = [
        f"{host}/desktop/qt6_6121/qt6_6121{suffix}/",
        f"{host}/extensions/qtwebengine/6121/61400/"
        + ("msvc2022_64/" if windows else "x86_64/"),
    ]
    modules = {"qtbase", "qtdeclarative", "qtsvg", "qttools", "qttranslations",
               "qtwebchannel", "qtpositioning", "qtshadertools", "qtwebengine"}
    if not windows:
        modules.add("icu")
    output = pathlib.Path(args.output).resolve()
    destination = output / VERSION / directory
    downloads = output / "downloads"
    destination.mkdir(parents=True, exist_ok=True)
    downloads.mkdir(parents=True, exist_ok=True)
    jobs = []
    for repository in repositories:
        url = BASE + repository
        metadata = ET.fromstring(read(url + "Updates.xml"))
        for package in metadata.findall("PackageUpdate"):
            name = package.findtext("Name", "")
            if "debug" in name or not name.endswith(arch):
                continue
            version = package.findtext("Version", "")
            for archive in package.findtext("DownloadableArchives", "").split(","):
                archive = archive.strip()
                if archive.split("-")[0] not in modules:
                    continue
                jobs.append((url + name + "/" + version + archive, downloads / archive))
    found = {path.name.split("-")[0] for _, path in jobs}
    if found != modules:
        raise RuntimeError(f"Incomplete SDK metadata: missing {modules - found}")

    def download(job):
        url, path = job
        expected = read(url + ".sha1").decode().strip().split()[0].lower()
        if len(expected) != 40 or any(c not in "0123456789abcdef" for c in expected):
            raise RuntimeError("Invalid archive checksum metadata")
        if not path.exists() or hashlib.sha1(path.read_bytes()).hexdigest() != expected:
            print("Downloading " + path.name, flush=True)
            with urllib.request.urlopen(url, timeout=180) as source, path.open("wb") as target:
                shutil.copyfileobj(source, target)
        if hashlib.sha1(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError("SDK checksum mismatch: " + path.name)
        return path

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        archives = list(pool.map(download, jobs))
    # Windows Server 2022 bsdtar lacks LZMA; GitHub runners include 7-Zip.
    extractor = shutil.which("7z")
    if windows and not extractor:
        installed = pathlib.Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "7-Zip/7z.exe"
        if installed.exists():
            extractor = str(installed)
    for archive in archives:
        print("Extracting " + archive.name, flush=True)
        command = ([extractor, "x", "-y", "-o" + str(destination), str(archive)] if extractor
                   else ["tar", "-xf", str(archive), "-C", str(destination)])
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    (destination / "bin" / "qt.conf").write_text("[Paths]\nPrefix=..\n", encoding="utf-8")
    print("SDK installed: " + str(destination), flush=True)


if __name__ == "__main__":
    main()
