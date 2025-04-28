!include MUI2.nsh

!macro customInstall
  NSISdl::download https://aka.ms/vs/17/release/vc_redist.x64.exe "$INSTDIR\vc_redist.x64.exe"

  ${If} ${FileExists} `$INSTDIR\vc_redist.x64.exe`
    ExecWait '$INSTDIR\vc_redist.x64.exe /passive /norestart' $1

    ${If} $1 != '0'
      ${If} $1 != '3010'
        MessageBox MB_OK|MB_ICONEXCLAMATION 'WARNING: Streamlabs was unable to install the latest Visual C++ Redistributable package from Microsoft.'
      ${EndIf}
    ${EndIf}

    # ${If} $1 == '3010'
    #     MessageBox MB_OK|MB_ICONEXCLAMATION 'You must restart your computer to complete the installation.'
    # ${EndIf}

  ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION 'WARNING: Streamlabs was unable to download the latest Visual C++ Redistributable package from Microsoft.'
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
    ; REBOOTOK flag is required, because files might get injected into a game process and system may prevent their removal
    ; see: https://nsis.sourceforge.io/Reference/RMDir
    RMDir /r /REBOOTOK "C:\\ProgramData\\obs-studio-hook"
  ${EndIf}
FunctionEnd