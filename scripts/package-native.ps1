param([string]$NsisRoot = '', [string]$Runtime = 'release/HexSound-native')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$temporary=Join-Path (Get-Location) '.tools/tmp'
New-Item -ItemType Directory -Force -Path $temporary | Out-Null
$env:TEMP=$temporary; $env:TMP=$temporary
$runtimePath = (Resolve-Path -LiteralPath $Runtime).Path
if (!(Test-Path -LiteralPath "$runtimePath/HexSound.exe")) { throw 'Сначала выполните build-native.ps1 -Test -Deploy' }
if (Test-Path -LiteralPath "$runtimePath/data") { throw 'В папке есть профиль. Соберите чистую папку для упаковки, не удаляя пользовательские данные.' }
$versionMatch = [regex]::Match((Get-Content -Raw CMakeLists.txt), 'project\(HexSound VERSION ([0-9.]+)')
if (!$versionMatch.Success) { throw 'Не найдена версия CMake' }
$version = $versionMatch.Groups[1].Value
if (!$NsisRoot) { $NsisRoot = Join-Path (Get-Location) '.tools/nsis' }
$compiler = Join-Path $NsisRoot 'Bin/makensis.exe'
if (!(Test-Path -LiteralPath $compiler)) { $compiler = (Get-Command makensis.exe -ErrorAction Stop).Source }
$files = Get-ChildItem -LiteralPath $runtimePath -File -Recurse | Where-Object { $_.Name -ne 'portable' -and $_.Extension -ne '.log' }
if ($files | Where-Object { $_.Name -match '^(api\.enc|Cookies|Login Data|preferences\.json|imports\.json|feedback\.json|transfer-journal\.json|wave-.*\.json)$' }) {
    throw 'Найдены файлы профиля. Упаковка отменена.'
}
$directories = Get-ChildItem -LiteralPath $runtimePath -Directory -Recurse | Sort-Object { $_.FullName.Length } -Descending
$manifest = [Collections.Generic.List[string]]::new()
foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($runtimePath,$file.FullName)
    if ($relative -match '["$\r\n]') { throw 'Недопустимое имя в manifest' }
    $manifest.Add('Delete "$INSTDIR\' + $relative + '"')
}
foreach ($directory in $directories) {
    $relative = [IO.Path]::GetRelativePath($runtimePath,$directory.FullName)
    if ($relative -match '["$\r\n]') { throw 'Недопустимое имя каталога в manifest' }
    $manifest.Add('RMDir "$INSTDIR\' + $relative + '"')
}
$manifestPath = Join-Path (Get-Location) '.tools/uninstall-files.nsh'
$manifest | Set-Content -LiteralPath $manifestPath -Encoding utf8
$setupPath = Join-Path (Get-Location) "release/HexSound-$version-setup.exe"
& $compiler "/O.tools/nsis-compile.log" "/DRUNTIME=$runtimePath" "/DOUTPUT=$setupPath" "/DVERSION=$version" "/DMANIFEST=$manifestPath" native/installer.nsi
if ($LASTEXITCODE -ne 0) { throw "NSIS: $LASTEXITCODE" }
$zipPath = Join-Path (Get-Location) "release/HexSound-$version-native-portable.zip"
Compress-Archive -LiteralPath $runtimePath -DestinationPath $zipPath -Force -CompressionLevel Optimal
Get-FileHash -LiteralPath $setupPath,$zipPath -Algorithm SHA256 |
    ForEach-Object { $_.Hash.ToLower() + '  ' + [IO.Path]::GetFileName($_.Path) } |
    Set-Content -LiteralPath "release/HexSound-$version-SHA256SUMS.txt" -Encoding ascii
Write-Output "Готово: $setupPath"
Write-Output "Portable: $zipPath"
