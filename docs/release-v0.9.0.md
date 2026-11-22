## Русский

HexSound стал единым музыкальным пространством. В боковой панели остались медиатека, волна, очередь, умные плейлисты, плеер и история. Подключения, перенос, музыкальные папки, проверка совпадений и отчёты находятся в настройках. Метки источников убраны из списка треков.

После API-входа запускается синхронизация библиотеки. Для обычного входа SoundCloud добавлен импорт лайков и доступных плейлистов из веб-сессии без извлечения ключей или токенов. Данные появляются по мере загрузки; чтение ограничено по времени и числу плейлистов. Неполное чтение не удаляет прежние записи. Если сайт изменит разметку или ограничит доступ, приложение сообщает об ошибке; API остаётся альтернативой.

Добавлены восемь фонов: туманность, призма, светлячки, ленты, круги на воде, снег, кометы и пульс. Всего 18 вариантов, включая отключённый фон. Сохранены остановка скрытых эффектов и освобождение canvas-буферов.

На старте приложение проверяет GitHub Releases. Новая версия показывается поверх размытого интерфейса после анимации логотипа. Можно загрузить обновление, продолжить без него или прочитать список изменений. Перед установкой проверяются размер и SHA-256 официального файла. Setup запускает установщик, Portable заменяется после завершения приложения, AppImage обновляется на месте; DEB открывается системным установщиком. Windows-файлы по-прежнему не подписаны Authenticode. Проверка обновлений также доступна в настройках.

## English

Unified navigation and a quieter library; service connections, transfer tools and maintenance moved into Settings. API sign-in starts library sync automatically. SoundCloud web sessions can import visible likes and available playlist metadata without extracting authentication tokens; bounded partial imports preserve cached records.

Eight new background effects bring the total to 18 choices. Startup now checks official GitHub releases and offers an update over a blurred intro, with skip and changelog controls. Downloads are size/SHA-256 verified. Windows Setup opens the installer; Portable and AppImage support replacement; DEB uses the system package installer. Windows builds remain unsigned. Provider API, web-login and DRM restrictions still apply.
