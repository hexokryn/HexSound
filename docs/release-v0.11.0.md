# HexSound 0.11.0

- Громкость меняется во время движения ползунка. Старые снимки состояния не сбивают выбранное значение; родной скрытый регулятор SoundCloud получает корректные координаты.
- Моя волна: одна кнопка запуска/паузы, оценки, пропуск, сохранённые настройки новизны и настроения, автоматическое пополнение очереди. Начальная загрузка лайков показывает состояние ожидания и допускает отмену.
- Настроение задаёт поисковые слова SoundCloud, а не анализирует аудио. Это собственный подбор HexSound, не алгоритм или API Яндекса. При недоступном каталоге известные треки остаются явно подписанным миксом.
- Прослушивание по-прежнему работает через обычный SoundCloud-вход. Новых сервисов или отдельного аудиодвижка нет.

Live volume changes, stale-poll protection and native SoundCloud slider geometry fixes. Personal radio adds persistent discovery/mood settings, feedback, pause/resume and queue replenishment. Mood guides catalogue searches; it is not audio classification or Yandex integration.
