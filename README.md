# HexSound

[Русский](README.md) · [English](README.en.md) · [Скачать](https://github.com/hexokryn/HexSound/releases/latest) · [Telegram автора](https://t.me/zexokkydev)

SoundCloud для Windows и Linux с оформлением HexSound. Обзор, лента, лайки и плейлисты работают через официальный веб-плеер. Вход выполняется внутри приложения; сессия сохраняется между запусками.

![Экран текста песни](docs/screenshots/player-dark.png)

- Нижняя панель воспроизведения и отдельный экран с текстом песни
- 32 темы, фоны, настройки движения и скрываемая боковая панель
- «Моя волна» по лайкам SoundCloud без API-ключей
- Импорт CSV, TSV и JSON в новый плейлист SoundCloud с проверкой совпадений
- Проверяемые обновления из GitHub Releases

Для прослушивания нужен обычный вход SoundCloud. Импорт файла сам по себе не изменяет аккаунт: запись нового плейлиста требует подключения SoundCloud API и подтверждения совпадений. Доступность треков зависит от SoundCloud и региона. Текст песни ищется в LRCLIB или загружается из LRC.

## Скачать

[Windows Setup](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-setup.exe) · [Windows Portable](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-portable.exe)

[Linux AppImage](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-linux-x86_64.AppImage) · [DEB](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-linux-amd64.deb) · [tar.gz](https://github.com/hexokryn/HexSound/releases/download/v0.11.0/HexSound-0.11.0-linux-x64.tar.gz)

При переходе с 0.9.2 и старше используйте ручную установку: в прежнем загрузчике была ошибка редиректа GitHub. Сессия SoundCloud и оформление сохраняются. Ветки с другими сервисами больше не входят в приложение; прежние файлы пользовательских данных автоматически не удаляются.

## Разработка

Electron, HTML/CSS и JavaScript. Rust не используется.

```sh
npm ci
npm test
npm start
npm run dist -- --publish never
npm run dist:linux -- --publish never
```

[Структура и проверки](docs/development.ru.md) · [Волна и воспроизведение](docs/experience.md) · [Импорт файлов](docs/library-import.md) · [SoundCloud API](docs/services.md)

Неофициальный клиент, не связан с SoundCloud. [MIT](LICENSE).
