Unicode true
!include "MUI2.nsh"
Name "HexSound"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\HexSoundNative"
InstallDirRegKey HKCU "Software\HexSoundNative" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID zlib
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"
!insertmacro MUI_LANGUAGE "English"
Section "HexSound"
    SetOutPath "$INSTDIR"
    File /r /x data /x portable /x *.log "${RUNTIME}\*.*"
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\HexSoundNative" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HexSoundNative" "DisplayName" "HexSound"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HexSoundNative" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HexSoundNative" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HexSoundNative" "DisplayIcon" "$INSTDIR\HexSound.exe"
    CreateShortcut "$SMPROGRAMS\HexSound Native.lnk" "$INSTDIR\HexSound.exe"
SectionEnd
Section "Uninstall"
    ; Remove only files recorded at packaging time. Preserve profiles and user files.
    !include "${MANIFEST}"
    Delete "$SMPROGRAMS\HexSound Native.lnk"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HexSoundNative"
    DeleteRegKey HKCU "Software\HexSoundNative"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir "$INSTDIR"
SectionEnd
