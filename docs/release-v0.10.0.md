# HexSound 0.10.0

HexSound снова работает как приложение для SoundCloud. Каталог, лайки, плейлисты и история открываются в официальном веб-плеере с оформлением HexSound. Треки запускаются на странице SoundCloud, нижняя панель управляет тем же воспроизведением.

- Убраны единая медиатека, подключения других сервисов, локальный аудиодвижок, мини-плеер, умные плейлисты и статистика.
- Сохранены «Моя волна» по лайкам SoundCloud, темы, фоны и экран текста песни.
- Перенос оставлен только из CSV, TSV и JSON в SoundCloud: с проверкой совпадений и созданием нового плейлиста. Для записи нужен SoundCloud API; для прослушивания достаточно обычного входа.
- В интерфейсе убраны рекламные описания, декоративные блоки и лишние кнопки. У новых установок обложка неподвижна, системное уменьшение движения учитывается.
- Проверки скачивания обновлений с GitHub сохранены.

SoundCloud-only playback with the HexSound interface. Removed the unified library, other service connections and separate audio engine. Personal radio and file-to-SoundCloud playlist imports remain. Listening uses normal SoundCloud sign-in; playlist writes require SoundCloud API access.
