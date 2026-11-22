# Разработка HexSound

Рабочее приложение — Electron, HTML/CSS и JavaScript. SoundCloud воспроизводит музыку в изолированном WebContentsView с постоянной сессией persist:soundcloud. Переписывать проект на Rust не нужно.

- src/main.cjs: окно, веб-сессия, навигация, IPC и обновления
- src/soundcloud-theme.cjs: оформление страниц SoundCloud
- src/renderer.js, index.html и CSS: оболочка и настройки
- src/dock-player.js и player-renderer.js: управление плеером сайта и текст песни
- src/soundcloud-experience.cjs, wave-renderer.js: волна и очередь подборки
- src/session-library.cjs, web-discovery.cjs: ограниченное чтение видимой музыки и веб-поиск
- src/transfer-renderer.js, library/: импорт файлов и проверенный перенос в SoundCloud
- src/services/: только SoundCloud API, PKCE OAuth и защищённое хранение
- src/updates.cjs: GitHub Releases, проверка платформы, размера и SHA-256

Проверки: npm test; npm run check:experience. Последняя команда запускает изолированную локальную страницу с настоящим WAV-аудио, проверяет управление из нижней панели, сохранение страницы при навигации и адаптивность. Она не использует реальный аккаунт SoundCloud. Упакованные приложения проходят ту же проверку на Windows и Linux. scripts/check-update-transport.cjs отдельно проверяет реальный редирект GitHub без установки обновления.

npm run dist -- --publish never собирает Windows Setup/Portable. npm run dist:linux -- --publish never собирает Linux AppImage/DEB/tar.gz. На машине автора npm доступен как node .tools/package/bin/npm-cli.js.

Сохранить sandbox и contextIsolation. Не читать cookies или браузерные токены. Не экспортировать секреты. Не возвращать удалённую единую медиатеку, другие сервисы или локальный аудиодвижок. В репозитории и релизах не должно быть материалов Telegram и видео. Опубликованные релизы не перезаписывать.
