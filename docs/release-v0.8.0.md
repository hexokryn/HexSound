## Русский

В HexSound появилась «Моя волна»: подбор по библиотеке с объяснением рекомендаций, оценками, исключением треков и выбором каталога.

- Сохраняемая общая очередь, перетаскивание, «слушать далее», повтор и перемешивание.
- Собственный аудиодвижок для локальных файлов и доступных потоков SoundCloud API; для остальных сервисов остаётся официальный веб-плеер.
- Мини-плеер поверх окон с текущей строкой синхронизированного текста.
- Индекс музыкальных папок, обложки, теги и умные плейлисты.
- Ручное объединение и разделение записей в общей библиотеке.
- Локальная история и статистика прослушиваний.
- Журнал переносов, экспорт отчётов и продолжение после проверки целевого плейлиста.

Волна требует наполненной библиотеки и подключённого API каталога. Это собственный подбор HexSound, а не алгоритм Яндекс Музыки. Для YouTube доступны возможности YouTube Data API; адаптер Яндекс Музыки остаётся экспериментальным. Полный поток SoundCloud зависит от доступности записи для аккаунта; иногда сервис предоставляет только превью.

Windows: setup и portable. Linux x64: AppImage, DEB и tar.gz. Контрольные суммы — SHA256SUMS.txt. Перед обновлением завершите прежнюю версию через трей → Выйти. Настройки, библиотека и подключения остаются в пользовательском профиле. Автообновления пока нет; Windows EXE без цифровой подписи.

## English

HexSound 0.8 adds a personal library radio with recommendation reasons, feedback and catalogue selection; a persistent cross-service queue; native local-file and SoundCloud API playback; an always-on-top mini-player; local folders, tags and smart playlists; manual duplicate decisions; local listening statistics; and resumable transfer journals with JSON reports.

Radio needs a populated library and a connected catalogue API. It uses HexSound's own selection logic. Spotify and YouTube recommendations use artist search; SoundCloud and the experimental Yandex adapter can also query related tracks. Other services continue to use their official web players. SoundCloud stream access can be restricted or limited to previews.

Windows setup/portable and Linux AppImage/DEB/tar.gz are included with SHA256SUMS.txt. Quit the previous tray instance before updating. Existing profile data is preserved. The interface is in Russian; Windows executables are unsigned.
