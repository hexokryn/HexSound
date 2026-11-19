## Русский

HexSound 0.7.0 добавляет собственную медиатеку и поддержку Linux.

- Исправлена задержка появления текста: активная строка читается на таймкоде, а часы не сбрасываются при повторных снимках таймлайна.
- Единая библиотека с поиском, фильтрами, привязкой к источникам и JSON/CSV импортом.
- OAuth/API-подключения Spotify, SoundCloud и YouTube, отдельные веб-сессии сервисов и защищённое хранение ключей.
- Экспериментальный адаптер Яндекс Музыки по личному музыкальному токену.
- Перенос через предварительный поиск и ручную проверку неоднозначных совпадений. Создаётся новый плейлист; исходный не изменяется. План привязан к аккаунту назначения.
- Windows Setup и Portable; Linux x64 AppImage, DEB и tar.gz.
- Репозиторий и новые релизы содержат код, документацию, иллюстрации интерфейса и сборки. Материалы для Telegram исключены.

API-вход требует собственных ключей/приложения или действующего личного токена. Обычный вход на сайте не является API-подключением. YouTube использует официальный Data API для плейлистов YouTube; закрытая медиатека Music не имитируется. Яндекс использует неофициальный API, совместимость которого может меняться.

Воспроизведение остаётся у официальных веб-плееров; ограничения аккаунта, региона и DRM сохраняются. При недоступном медиа-таймлайне текст показывается без автоматической синхронизации. Автоматические проверки используют изолированные тестовые данные; реальные аккаунты без пользовательских учётных данных не проверялись.

Перед обновлением завершите старую версию через трей. Профиль сохраняется. Windows EXE не подписаны; автоматического обновления нет. Контрольные суммы — в SHA256SUMS.txt.

## English

HexSound 0.7.0 adds a native unified library, reviewed playlist transfers, API connections and Linux builds. Lyric onset no longer waits for a hidden-word animation or repeated rounded timeline samples.

Spotify, SoundCloud and YouTube use their API connections; Yandex Music has an experimental personal-token adapter. Website sessions remain separate from API authorization. YouTube covers YouTube playlists through Data API, not the full private Music library. Original playlists are preserved, ambiguous matches need review, and transfers are bound to the destination account.

Downloads include Windows Setup/Portable and Linux x64 AppImage/DEB/tar.gz. Code, documentation and app screenshots remain in the repository; Telegram materials are excluded from new releases.

Provider credentials and permissions are required. Automated checks use isolated fixtures and do not verify your real provider accounts. Official web players handle playback and their DRM/region/subscription restrictions still apply. Unknown media timing falls back to readable unsynchronized lyrics. Windows builds are unsigned; quit the previous version before updating. Checksums are included.
