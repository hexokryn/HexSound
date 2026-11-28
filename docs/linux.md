# Linux

Код использует C++20 и Qt 6.8+; Windows DPAPI изолирован через Q_OS_WIN. На Linux API-секреты остаются в памяти. QML и DOM-мост общие для платформ.

Установите CMake 3.21+, Ninja, GCC/Clang и Qt Quick/Controls/WebEngine/Network/Test с зависимостями. Для SDK Qt задайте CMAKE_PREFIX_PATH. Qt WebEngine требует системные NSS, EGL/OpenGL и поддерживаемую графическую среду.

```sh
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/opt/Qt/6.12.1/gcc_64
cmake --build build --parallel
ctest --test-dir build --output-on-failure
xvfb-run -a ./build/HexSound --smoke artifacts/native-linux
cmake --install build --prefix "$PWD/release/linux"
./release/linux/bin/HexSound --smoke artifacts/native-linux-packaged
```

CMake использует штатный Qt deployment script и CPack TGZ/DEB; bin/HexSound и desktop entry создаются при установке. Пакет должен включать Qt WebEngine resources/helper и QML-модули. Проверить установку, зависимости и запуск на чистой целевой системе перед публикацией. Устанавливать DEB из автотеста не нужно.

Локальная рабочая машина — Windows. Новая Linux-сборка пока не запускалась; наличие CMake и workflow не является подтверждением совместимости. Оставляйте sandbox включённым, не добавляйте --no-sandbox для обхода проблем запуска.
