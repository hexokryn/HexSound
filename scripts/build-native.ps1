param(
    [string]$QtRoot = $env:QT_ROOT_DIR,
    [string]$BuildDir = '.tools/build-native-vs',
    [switch]$Deploy,
    [switch]$Test
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!$QtRoot) { $QtRoot = Join-Path (Get-Location) '.tools/Qt/6.12.1/msvc2022_64' }
if (!(Test-Path -LiteralPath "$QtRoot/bin/qmake.exe")) { throw 'Укажите -QtRoot с Qt 6.8+ MSVC x64 (WebEngine, WebChannel, Positioning, ShaderTools).' }
$QtRoot = (Resolve-Path -LiteralPath $QtRoot).Path
$vswhere = "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
if (!(Get-Command cl.exe -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $vswhere)) {
    $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    $setup = Join-Path $installation 'VC/Auxiliary/Build/vcvars64.bat'
    $variables = & cmd.exe /c "`"$setup`" >nul && set"
    foreach ($line in $variables) { if ($line -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
}
$cmake = (Get-Command cmake.exe -ErrorAction SilentlyContinue).Source
if (!$cmake -and $installation) { $cmake = Join-Path $installation 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe' }
if (!$cmake) { throw 'Установите CMake 3.21+ и MSVC 2022 Build Tools.' }
$env:PATH = "$QtRoot/bin;$env:PATH"
$temporary = Join-Path (Get-Location) '.tools/tmp'
New-Item -ItemType Directory -Force -Path $temporary | Out-Null
$env:TEMP = $temporary; $env:TMP = $temporary
function Invoke-Checked { param([string]$Program, [string[]]$Arguments) & $Program @Arguments; if ($LASTEXITCODE -ne 0) { throw "$Program завершился с кодом $LASTEXITCODE" } }
Invoke-Checked $cmake @('-S','.', '-B',$BuildDir,'-G','Visual Studio 17 2022','-A','x64',"-DCMAKE_PREFIX_PATH=$QtRoot")
Invoke-Checked $cmake @('--build',$BuildDir,'--config','Release','--parallel','4')
$executables = Join-Path $BuildDir 'Release'
if ($Test) {
    foreach ($testName in @('native_tests','controller_tests','rpc_tests')) {
        $reportPath = Join-Path (Get-Location) ".tools/$testName-result.txt"
        $testProcess = Start-Process -WindowStyle Hidden -FilePath "$executables/$testName.exe" -ArgumentList '-o',"`"$reportPath`",txt" -PassThru
        if (!$testProcess.WaitForExit(60000)) { $testProcess.Kill(); throw "$testName timeout" }
        Get-Content -LiteralPath $reportPath
        if ($testProcess.ExitCode -ne 0) { throw "$testName failed: $($testProcess.ExitCode)" }
    }
    $application = (Resolve-Path -LiteralPath "$executables/HexSound.exe").Path
    $process = Start-Process -WindowStyle Hidden -FilePath $application -ArgumentList '--smoke','artifacts/native-smoke' -PassThru -RedirectStandardOutput '.tools/smoke-out.log' -RedirectStandardError '.tools/smoke-error.log'
    if (!$process.WaitForExit(60000)) { $process.Kill(); throw 'Превышено время проверки интерфейса' }
    if ($process.ExitCode -ne 0) { throw "Проверка интерфейса: $($process.ExitCode), см. artifacts/native-smoke/report.json" }
}
if ($Deploy) {
    $destination = Join-Path (Get-Location) 'release/HexSound-native'
    if (Test-Path -LiteralPath $destination) {
        if (Test-Path -LiteralPath "$destination/data") { throw 'В папке сборки есть профиль: выберите чистую папку, сохранив данные.' }
        # Keep previous deployment intact; never mix DLLs from different SDKs.
        $previous = Join-Path (Get-Location) ('.tools/previous-runtime-' + [guid]::NewGuid().ToString('N'))
        $workspace = [IO.Path]::GetFullPath((Get-Location).Path) + [IO.Path]::DirectorySeparatorChar
        foreach ($path in @($destination,$previous)) {
            if (![IO.Path]::GetFullPath($path).StartsWith($workspace,[StringComparison]::OrdinalIgnoreCase)) { throw 'Deployment path outside workspace' }
        }
        Move-Item -LiteralPath $destination -Destination $previous
    }
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -LiteralPath "$executables/HexSoundUpdate.exe" -Destination $destination
    Copy-Item -LiteralPath "$executables/HexSound.exe" -Destination $destination
    Invoke-Checked "$QtRoot/bin/windeployqt.exe" @('--release','--qmldir',"$PSScriptRoot/../native/qml",'--no-translations','--skip-plugin-types','position,qmltooling',"$destination/HexSound.exe")
    $crt = Join-Path $env:VCToolsRedistDir 'x64/Microsoft.VC143.CRT'
    if (!(Test-Path -LiteralPath $crt)) { throw 'Не найден redistributable CRT MSVC x64 для автономной сборки' }
    Get-ChildItem -LiteralPath $crt -Filter '*.dll' -File | Copy-Item -Destination $destination
    Copy-Item -LiteralPath LICENSE,THIRD_PARTY_NOTICES.md -Destination $destination
    Copy-Item -LiteralPath native/licenses -Destination $destination -Recurse -Force
    Set-Content -LiteralPath "$destination/portable" -Value '' -NoNewline
    Write-Output "Готово: $destination/HexSound.exe"
}
