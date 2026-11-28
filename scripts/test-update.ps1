param([string]$Archive='release/HexSound-0.13.0-native-portable.zip', [string]$BuildDir='.tools/build-native-vs')
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$root=Join-Path (Get-Location) ('.tools/update-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$root/target" -Force | Out-Null
Set-Content -LiteralPath "$root/target/HexSound.exe" -Value 'untouched fixture'
$env:TEMP=Join-Path (Get-Location) '.tools/tmp';$env:TMP=$env:TEMP
function Test-Archive([string]$Path,[bool]$Expected,[string]$Digest='') {
    $info=Get-Item -LiteralPath $Path
    if(!$Digest){$Digest=(Get-FileHash -LiteralPath $Path).Hash.ToLower()}
    @{archive=$info.FullName;target="$root/target";size=$info.Length;sha256=$Digest;pid=0}|ConvertTo-Json|Set-Content -LiteralPath "$root/job.json" -Encoding utf8
    # Verify-only explicitly forbids replacing files or starting the application.
    $proc=Start-Process -WindowStyle Hidden -FilePath "$PWD/release/HexSound-native/HexSoundUpdate.exe" -ArgumentList "`"$root/job.json`"",'--verify-only' -PassThru
    if(!$proc.WaitForExit(120000)){$proc.Kill();throw 'Helper timeout'}
    if(($proc.ExitCode -eq 0) -ne $Expected){throw "Unexpected helper result: $($proc.ExitCode)"}
    if((Get-Content -Raw "$root/target/HexSound.exe").Trim() -ne 'untouched fixture'){throw 'Target modified in verify-only mode'}
}
Test-Archive $Archive $true
Test-Archive $Archive $false ('0'*64)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$bad="$root/traversal.zip";$zip=[IO.Compression.ZipFile]::Open($bad,[IO.Compression.ZipArchiveMode]::Create)
$entry=$zip.CreateEntry('../escaped.txt');$stream=[IO.StreamWriter]::new($entry.Open());$stream.Write('must not escape');$stream.Dispose();$zip.Dispose()
Test-Archive $bad $false
New-Item -ItemType Directory -Force -Path "$root/probe","$root/target/data" | Out-Null
Set-Content -LiteralPath "$root/target/data/keep.txt" -Value 'keep profile'
Copy-Item -LiteralPath "$BuildDir/Release/update_probe.exe" -Destination "$root/probe/HexSound.exe"
Copy-Item -LiteralPath release/HexSound-native/HexSoundUpdate.exe,release/HexSound-native/Qt6Core.dll -Destination "$root/probe"
Get-ChildItem release/HexSound-native -Filter '*.dll' | Where-Object {$_.Name -match '^(msvcp|vcruntime|concrt)'} | Copy-Item -Destination "$root/probe"
$probeZip="$root/probe.zip";[IO.Compression.ZipFile]::CreateFromDirectory("$root/probe",$probeZip)
$probeInfo=Get-Item $probeZip
@{archive=$probeZip;target="$root/target";dataDirectory="$root/target/data";size=$probeInfo.Length;sha256=(Get-FileHash $probeZip).Hash.ToLower();pid=0}|ConvertTo-Json|Set-Content -LiteralPath "$root/job.json" -Encoding utf8
$proc=Start-Process -WindowStyle Hidden -FilePath "$PWD/release/HexSound-native/HexSoundUpdate.exe" -ArgumentList "`"$root/job.json`"" -PassThru
if(!$proc.WaitForExit(60000) -or $proc.ExitCode -ne 0){throw 'Fixture replacement failed'}
$deadline=(Get-Date).AddSeconds(10);while(!(Test-Path "$root/target/restart-proof.txt") -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 100}
if(!(Test-Path "$root/target/restart-proof.txt")){throw 'Updated fixture did not restart'}
$restartArgs=Get-Content -Raw "$root/target/restart-args.json"|ConvertFrom-Json
if($restartArgs[1] -ne '--data-dir' -or $restartArgs[2] -ne "$root/target/data"){throw 'Profile path lost on restart'}
if((Get-Content "$root/target/data/keep.txt").Trim() -ne 'keep profile'){throw 'Profile changed'}
Write-Output 'Fixture replacement and restart passed; profile preserved.'
Start-Sleep -Milliseconds 200
$original=(Get-FileHash "$root/target/HexSound.exe").Hash
[IO.File]::AppendAllText("$root/probe/HexSound.exe",'new version fixture')
Set-Content -LiteralPath "$root/probe/a-new-file.txt" -Value 'new file must be rolled back'
Set-Content -LiteralPath "$root/probe/zz-locked.dat" -Value 'new value'
Set-Content -LiteralPath "$root/target/zz-locked.dat" -Value 'old value'
$rollbackZip="$root/rollback.zip";[IO.Compression.ZipFile]::CreateFromDirectory("$root/probe",$rollbackZip)
$rollbackInfo=Get-Item $rollbackZip
@{archive=$rollbackZip;target="$root/target";size=$rollbackInfo.Length;sha256=(Get-FileHash $rollbackZip).Hash.ToLower();pid=0}|ConvertTo-Json|Set-Content -LiteralPath "$root/job.json" -Encoding utf8
$locked=[IO.File]::Open("$root/target/zz-locked.dat",[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try {
    $proc=Start-Process -WindowStyle Hidden -FilePath "$PWD/release/HexSound-native/HexSoundUpdate.exe" -ArgumentList "`"$root/job.json`"" -PassThru
    if(!$proc.WaitForExit(60000) -or $proc.ExitCode -ne 3){throw 'Expected controlled rollback'}
} finally {$locked.Dispose()}
if((Get-FileHash "$root/target/HexSound.exe").Hash -ne $original){throw 'Original executable not restored'}
if(Test-Path "$root/target/a-new-file.txt"){throw 'New file not rolled back'}
if((Get-Content "$root/target/zz-locked.dat").Trim() -ne 'old value'){throw 'Locked file modified'}
$result=Get-ChildItem -LiteralPath $root -Directory -Filter 'stage-*' | ForEach-Object { Join-Path $_.FullName 'backup' }
if(!$result){throw 'No retained recovery backup'}
if((Get-Content "$root/target/data/keep.txt").Trim() -ne 'keep profile'){throw 'Profile modified during rollback'}
Write-Output 'Locked-file rollback passed: original EXE restored, new files removed, profile and backup preserved.'
Write-Output 'Update helper: valid archive, bad hash and traversal checks passed; no working application was installed or replaced.'
