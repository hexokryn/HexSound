# HexSound 0.9.3

Исправлена ошибка `Redirect was cancelled` при загрузке обновлений с GitHub. Загрузчик использует Node fetch и проверяет каждый адрес перенаправления. Проверки размера и SHA-256 сохранены.

В сборку добавлена проверка скачивания реального файла GitHub Releases внутри Electron на Windows и Linux. Она проверяет контрольную сумму и не запускает установку.

Если в установленной версии появляется эта ошибка, скачайте Setup или Portable из этого релиза вручную. Версия 0.9.3 содержит исправленный загрузчик для следующих обновлений. Настройки и медиатека сохраняются.

Fixed `Redirect was cancelled` during GitHub update downloads. The updater uses Node fetch, validates every redirect host, and keeps size and SHA-256 checks. CI now downloads and verifies a real GitHub release asset inside Electron on Windows and Linux without installing it.

If an older version shows this error, download this release's Setup or Portable manually. Version 0.9.3 contains the fixed updater for future releases. Your settings and library are preserved.
