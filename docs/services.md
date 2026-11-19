# Подключение музыкальных сервисов

Вход на сайт и доступ к API — отдельные подключения. Окно сайта хранит собственную сессию сервиса. API нужен, чтобы читать библиотеку в интерфейсе HexSound и переносить плейлисты. Веб-сессия не превращается в API-токен, пароли и cookies не извлекаются.

## Возможности

| Сервис | API-вход | Единая библиотека | Перенос |
| --- | --- | --- | --- |
| Spotify | OAuth PKCE, свой Client ID; либо готовый OAuth access token | Сохранённые треки и доступные плейлисты | Поиск, создание нового плейлиста, добавление треков |
| SoundCloud | OAuth PKCE, свои Client ID и Client Secret; либо готовый OAuth access token | Лайки и собственные плейлисты | Поиск, создание нового плейлиста, добавление треков |
| YouTube Music / YouTube | Google OAuth для Desktop app; API key отдельно разрешает только публичный поиск | Собственные плейлисты YouTube через YouTube Data API | Поиск музыкальных видео и перенос в новый плейлист YouTube |
| Яндекс Музыка · экспериментально | Личный музыкальный токен; вход на сайте отдельно | Любимые треки и собственные плейлисты | Поиск, создание и заполнение нового собственного плейлиста |

Для YouTube подключён официальный YouTube Data API. Это не закрытый API YouTube Music: отдельная музыкальная медиатека, рекомендации и список всех понравившихся песен Music не выдаются за доступные. API ключ без OAuth не открывает личные плейлисты.

Ключ Yandex ID не предоставляет сам по себе доступ к музыкальной библиотеке. Для экспериментального адаптера нужен ваш личный музыкальный токен: он проверяется запросом account/status и хранится так же, как остальные секреты. Здесь используется неофициальный Music API по протоколу, описанному в исходниках yandex-music-api. Совместимость может измениться на стороне сервиса. Общих чужих OAuth Client ID, автоматического извлечения паролей или cookies в приложении нет. Обычный вход на сайте и импорт файла доступны отдельно.

## OAuth

1. Создайте собственное приложение у провайдера. В настройках HexSound укажите его Client ID. Для SoundCloud также нужен Client Secret; для Google используйте OAuth client типа **Desktop app** и заполните Client Secret, если он указан в выданном JSON.
2. Зарегистрируйте Redirect URI там, где это требует провайдер. Spotify использует `http://127.0.0.1/callback/spotify` с динамическим портом. Google Desktop app принимает loopback redirect с динамическим портом. Для SoundCloud по умолчанию задан `http://127.0.0.1:8766/callback/soundcloud`; зарегистрированный URI должен совпадать с ним и поддерживаться настройками вашего приложения. Порт можно изменить в HexSound.
3. Нажмите API-вход. Авторизация откроется в системном браузере; после согласия вернитесь в HexSound. Локальный callback слушает только `127.0.0.1`, проверяет случайный `state`, а обмен кода использует PKCE S256. Время ожидания — три минуты.
4. Доступ считается подключённым после проверки профиля через API. Отказ, отсутствие разрешений, ошибка ключа или ограничение провайдера показываются как ошибки; они не превращаются в успешную синхронизацию.

Spotify в режиме разработки ограничивает доступ аккаунтов и операций; проверьте настройки приложения и текущие требования сервиса. Google OAuth может потребовать добавления тестовых пользователей, публикации consent screen и разрешения YouTube Data API. Собственных общих OAuth-приложений провайдеров в HexSound нет.

Если уже есть собственный OAuth access token, его можно добавить отдельно. Вводить нужно сам токен, без слова `Bearer` и пробелов. Refresh token и срок действия необязательны. Импорт проверяет профиль и не заменяет рабочее подключение неверным токеном.

## Хранение и отключение

Ключи, токены и Client Secret доступны только главному процессу. Они записываются в `connections.enc` внутри пользовательского каталога через Electron `safeStorage`. В интерфейс возвращаются Client ID, Redirect URI и признаки наличия секретов, а не сами секреты.

На Linux при недоступном системном хранилище или backend `basic_text` секреты остаются только в памяти до выхода. Незашифрованного файла с токенами приложение не создаёт. Настройте Secret Service/KWallet, если хотите сохранять подключение между запусками.

Refresh-запросы одного сервиса выполняются последовательно; новый refresh token сохраняется до следующего запроса. Смена OAuth-настроек и отключение отменяют незавершённый вход. Поздний ответ refresh не восстанавливает отключённый аккаунт. SoundCloud disconnect и Google revoke вызываются при отключении; у Spotify удаляется локальный токен, разрешение приложения при необходимости отзывается в настройках Spotify.

Перенос создаёт новый плейлист. Частично выполненные записи учитываются отдельно. HTTP-запросы на запись не повторяются автоматически после сетевой ошибки: сервис мог принять запись до разрыва соединения. Чтение ограниченно повторяется при 429/502/503/504 с учётом `Retry-After`. Ошибки не содержат токенов или сырых ответов провайдера.

## Контракт главного процесса

```js
const { createServiceHub } = require('./services/index.cjs');
const hub = createServiceHub({ directory, safeStorage, fetcher, openExternal, onChange });

hub.statuses(); // Безопасные состояния всех сервисов
hub.configure('spotify', { clientId });
await hub.connect('spotify');
await hub.importToken('spotify', { accessToken, refreshToken, expiresIn });
await hub.disconnect('spotify');

const adapter = hub.getAdapter('spotify');
await adapter.listLibrary({ signal });
await adapter.searchTracks({ query, title, artist, duration, signal });
await adapter.createPlaylist({ title, description, public: false, signal });
await adapter.addTracks({ playlistId, trackIds, signal });
hub.dispose();
```

ID сервисов: `spotify`, `soundcloud`, `youtube`, `yandex`. Секреты из `configure` сохраняются только при явно переданном поле; пустая строка очищает это поле. Изменение Client ID, Client Secret или Redirect URI сбрасывает прежний API-токен. `capabilities` отражает подключение, а `maxAddBatch` — размер блока для переноса. Метаданные и ссылки не означают права на воспроизведение вне сервиса; проигрывание передаётся официальному веб-плееру.

## Документация провайдеров

- [Spotify: PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [redirect URI](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri), [изменения API в феврале 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026). Используются актуальные `POST /me/playlists` и `/playlists/{id}/items`; поиск ограничен десятью результатами.
- [SoundCloud API guide](https://developers.soundcloud.com/docs/api/guide) и [официальная OpenAPI-схема](https://github.com/soundcloud/api/blob/master/openapi/api.yaml). Изменение состава плейлиста использует URN и полный список треков; неполный ответ не отправляется обратно поверх плейлиста.
- [Google OAuth для настольных приложений](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube playlists](https://developers.google.com/youtube/data/reference/rest/v3/playlists/list), [добавление видео](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/insert).
- [Исходники протокола yandex-music-api](https://github.com/MarshalX/yandex-music-api/blob/main/yandex_music/client.py): account/status, получение библиотеки и POST playlists/{kind}/change с revision/diff. Это документация стороннего SDK, а не официальный Music API.
- [Регистрация приложений Yandex ID](https://www.yandex.ru/dev/id/doc/en/register-api). Права к API конкретного сервиса задаются отдельно от входа в Yandex ID.
