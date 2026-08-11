!include MUI2.nsh

!macro customInstall
  ; Download to the secure NSIS temp dir (not user-writable) to prevent
  ; binary planting / privilege escalation if $INSTDIR is a world-writable path.
  InitPluginsDir
  NSISdl::download https://aka.ms/vs/17/release/vc_redist.x64.exe "$PLUGINSDIR\vc_redist.x64.exe"

  ${If} ${FileExists} `$PLUGINSDIR\vc_redist.x64.exe`
    ExecWait '$PLUGINSDIR\vc_redist.x64.exe /passive /norestart' $1

    ; Benign codes - do NOT warn: 0 ok | 3010 ok+reboot | 1638 same-or-newer already installed | 1641 ok+reboot started
    ${If}    $1 != '0'
    ${AndIf} $1 != '3010'
    ${AndIf} $1 != '1638'
    ${AndIf} $1 != '1641'
      MessageBox MB_OK|MB_ICONEXCLAMATION 'WARNING: Streamlabs could not install the Microsoft Visual C++ v14 Redistributable (x64), for Visual Studio 2017-2026 [error code $1].$\r$\n$\r$\nPlease install it manually from:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe'
    ${EndIf}
  ${Else}
    MessageBox MB_OK|MB_ICONEXCLAMATION 'WARNING: Streamlabs could not download the Microsoft Visual C++ v14 Redistributable (x64), for Visual Studio 2017-2026, from Microsoft.$\r$\n$\r$\nCheck your internet connection, then install it manually from:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe'
  ${EndIf}

  FileOpen $0 "$INSTDIR\installername" w
  FileWrite $0 $EXEFILE
  FileClose $0
!macroend

; Custom uninstall welcome page
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ModifyUnWelcome
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.LeaveUnWelcome
!insertmacro MUI_UNPAGE_WELCOME

Var /GLOBAL cleanupCheckbox

Function un.ModifyUnWelcome
  ${NSD_CreateCheckbox} 120u -18u 50% 12u "Clean application data"
  Pop $cleanupCheckbox

  SetCtlColors $cleanupCheckbox 0x000000 0xffffff
  ${NSD_Check} $cleanupCheckbox
FunctionEnd

Function un.LeaveUnWelcome
  ${NSD_GetState} $cleanupCheckbox $0
  ${If} $0 <> 0
    RMDir /r "$PROFILE\\AppData\\Roaming\\slobs-client"
    RMDir /r "$PROFILE\\AppData\\Roaming\\slobs-plugins"
    RMDir /r "$PROFILE\\AppData\\Roaming\\streamlabs-highlighter"
    RMDir /r "$PROFILE\\.cache\\streamlabs-vision"
    ; REBOOTOK flag is required, because files might get injected into a game process and system may prevent their removal
    ; see: https://nsis.sourceforge.io/Reference/RMDir
    RMDir /r /REBOOTOK "C:\\ProgramData\\obs-studio-hook"
  ${EndIf}
FunctionEnd