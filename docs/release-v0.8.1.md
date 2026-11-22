## Русский

Оптимизация памяти с сохранением прежнего интерфейса Electron.

- SoundCloud загружается при открытии, а не скрытно вместе с медиатекой.
- Выключенные и невидимые эффекты освобождают canvas-буфер; при возвращении эффект восстанавливается. Видимые анимации и качество оформления сохранены.
- Опрос плеера читает текущий трек вместо копирования всей очереди и всех оценок.
- Уменьшен буфер HLS; медиапрокси освобождает ссылки старого аудио при смене трека.
- Закрытый неиграющий веб-плеер выгружается. Играющее окно продолжает воспроизведение; вход сохраняется в постоянной сессии.
- Исправлена проверка канонических Windows-путей в тестах сборки.

Включены функции 0.8: «Моя волна», общая очередь, локальная музыка, умные плейлисты, история, мини-плеер и журнал переносов. В AGENTS.md добавлены структура проекта, актуальные требования и правила для следующих агентов. Перенос на Rust остановлен по запросу пользователя; Rust не является зависимостью приложения.

Для обновления завершите прежнюю версию через трей → Выйти. Windows Setup/Portable и Linux AppImage/DEB/tar.gz; контрольные суммы в SHA256SUMS.txt.

## English

Reduced memory use while preserving the existing Electron interface: SoundCloud loads on demand; inactive/disabled effect canvases release their backing stores; playback polling reads only the current queue item and feedback entry; HLS buffering is bounded; old media URLs are released on track changes; idle closed service windows are destroyed while playing sessions continue.

Includes the 0.8 library/radio/queue/local-file features and AGENTS.md project context. The Rust migration was stopped at the user's request. Quit the previous tray instance before updating. Windows executables remain unsigned.
