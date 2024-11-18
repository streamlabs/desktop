
!macro registerProtocol Protocol
  DetailPrint "Register ${Protocol} URI Handler"
	DeleteRegKey HKCU "Software\Classes\${Protocol}"
	WriteRegStr HKCU "Software\Classes\${Protocol}" "" "URL:${Protocol}"
	WriteRegStr HKCU "Software\Classes\${Protocol}" "URL Protocol" ""
	WriteRegStr HKCU "Software\Classes\${Protocol}\shell" "" ""
	WriteRegStr HKCU "Software\Classes\${Protocol}\shell\Open" "" ""
	WriteRegStr HKCU "Software\Classes\${Protocol}\shell\Open\command" "" '"$appExe" "%1"'
!macroend

!macro unregisterProtocol Protocol
	DeleteRegKey HKCU "Software\Classes\${Protocol}"
!macroend

# English
LangString failed_install 1033 "WARNING: N Air was unable to install the latest Visual C++ Redistributable package from Microsoft."
LangString require_restart 1033 "You must restart your computer to complete the installation."
LangString failed_download 1033 "WARNING: N Air was unable to download the latest Visual C++ Redistributable package from Microsoft."

# Japanese
LangString failed_install 1041 "警告: Microsoft の最新の Visual C++ 再頒布可能パッケージのインストールができませんでした。"	
LangString require_restart 1041 "インストールを完了するには、コンピューターを再起動してください。"	
LangString failed_download 1041 "警告: Microsoft から最新の Visual C++ 再頒布可能パッケージをダウンロードできませんでした。"	

!macro customInstall
  NSISdl::download https://aka.ms/vs/17/release/vc_redist.x64.exe "$INSTDIR\vc_redist.x64.exe"  

  ${If} ${FileExists} `$INSTDIR\vc_redist.x64.exe`
    ExecWait '$INSTDIR\vc_redist.x64.exe /passive /norestart' $1

    ${If} $1 != '0' 
      ${If} $1 != '3010'
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(failed_install)"
      ${EndIf}
    ${EndIf}

    # ${If} $1 == '3010'
    #     MessageBox MB_OK|MB_ICONEXCLAMATION "$(require_restart)"
    # ${EndIf}

  ${Else}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(failed_download)"
  ${EndIf}

  FileOpen $0 "$INSTDIR\installername" w
  FileWrite $0 $EXEFILE
  FileClose $0

  !insertMacro registerProtocol "n-air-app"
!macroend

!include "MUI2.nsh"
!include "nsDialogs.nsh"

Var Dialog
Var CheckBox
var /GLOBAL CheckBoxState

!macro customUninstallPage
  UninstPage custom un.removeAppDataPage un.removeAppDataPageLeave

  Function un.removeAppDataPage
    nsDialogs::Create 1018
    Pop $Dialog

    ; 既にアンインストールは完了してしまっているためキャンセルボタンは無効化する
    GetDlgItem $0 $HWNDPARENT 2
    EnableWindow $0 0

    ${NSD_CreateCheckbox} 10u 50u 200u 12u "アプリデータを削除する"
    Pop $CheckBox
    ${NSD_SetState} $CheckBox 0
    ${If} $CheckBoxState == ${BST_CHECKED}
      ${NSD_SetState} $CheckBox ${BST_CHECKED}
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function un.removeAppDataPageLeave
    ${NSD_GetState} $CheckBox $CheckBoxState
    ${If} $CheckBoxState == ${BST_CHECKED}
        ; change APPDATA ProgramData to Roming
        SetShellVarContext current
        ; RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
        ; DEBUG
        MessageBox MB_OK "RMDir /r $APPDATA\${APP_PACKAGE_NAME}"
    ${EndIf}
  FunctionEnd

  ; MUI_UNPAGE_FINISHの戻るボタンを無効化する
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.disableBack
  Function un.disableBack
    Push $0
    GetDlgItem $0 $HWNDPARENT 3
    EnableWindow $0 0
    Pop $0
  FunctionEnd
!macroend

!macro customUninstall
  !insertMacro unregisterProtocol "n-air-app"
!macroend
