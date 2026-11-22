# Импорт из файла в SoundCloud

Откройте Настройки → Перенос → Открыть файл. Поддерживаются JSON, CSV и TSV до 10 МБ. Файл сохраняет список треков для переноса и не меняет аккаунт SoundCloud. Для одного переноса выбирайте до 5000 треков.

Подключите SoundCloud API в настройках, найдите совпадения и проверьте неоднозначные записи. Кнопка «Создать плейлист» отправит выбранные записи в новый плейлист SoundCloud. Обычный веб-вход нужен для прослушивания и не даёт API-прав на запись.

## CSV

Минимальный пример:

```csv
title,artist,duration,url
Night drive,Example artist,03:05,https://example.com/track
Morning,Another artist,180,
```

`title` обязателен. `artist`, `duration`, `url`, `album`, `isrc`, `id` и `playlist` необязательны. Для надёжного сопоставления при переносе нужны исполнитель и длительность. Если длительность неизвестна, совпадение потребует проверки.

Поддерживаются разделители запятая, точка с запятой и табуляция. Поля с разделителями или переносами строк заключаются в двойные кавычки; кавычка внутри поля записывается как `""`. Строка заголовков обязательна. Допускается UTF-8 BOM.

Длительность — число секунд или `mm:ss`, также принимается `hh:mm:ss`. Для миллисекунд используйте отдельный заголовок `duration_ms` или `Duration (ms)`. В одном файле должна быть одна колонка длительности. Значения с неясными единицами не угадываются.

```csv
Название трека;Исполнитель;Длительность;Плейлист
Ночь;Пример исполнителя;03:05;Дорога
Утро;Другой исполнитель;02:10;Дорога
```

Колонка `playlist` / `Playlist Name` / `Плейлист` группирует записи в локальные плейлисты. Ссылки вида `spotify:track:…` преобразуются в HTTPS-ссылки Spotify. Прочие исполняемые схемы URL не сохраняются.

Также принимаются заголовки распространённых экспортов: `Track Name`, `Artist Name(s)`, `Album Name`, `Track URI`, `Duration (ms)` и `ISRC`.

## JSON

Обычный список:

```json
{
  "service": "local",
  "tracks": [
    {
      "id": "night-drive",
      "title": "Night drive",
      "artist": "Example artist",
      "duration": 185
    }
  ],
  "playlists": [
    {
      "id": "road",
      "title": "Дорога",
      "trackIds": ["night-drive"]
    }
  ]
}
```

Принимается и JSON-массив треков. Для обычного файла источник выбирается в интерфейсе; `local` обозначает локальный импорт. Резервная копия HexSound со `schema: 1` и `providers` сохраняет источники каждого сервиса.

Импорт объединяется с существующей локальной библиотекой. Ключи API, токены и неизвестные поля файла не сохраняются в данных треков. Файл не подтверждает наличие или доступность записи в каталоге другого сервиса: перед переносом проводится поиск совпадений, а неоднозначные результаты требуют выбора.

## English

Import accepts UTF-8 JSON or CSV, up to 10 MB and 50,000 records. CSV supports comma, semicolon and tab delimiters, quoted fields and newlines, and common Spotify export headers. `title` is required; artist and duration are recommended for transfer matching. Duration is in seconds or `mm:ss`; milliseconds require a `duration_ms` / `Duration (ms)` header. JSON can be a track array, a `{tracks, playlists}` object, or a HexSound backup. Imports add local metadata and never change the source service's remote playlists.
