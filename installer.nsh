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

; H1-3045235: the installer runs elevated (nsis.perMachine = true -> RequestExecutionLevel
; admin), and NSIS's license page turns URLs in the licence text -- e.g. the GPLv3 header's
; <https://fsf.org/> -- into live hyperlinks. NSIS opens them with a plain ShellExecute, so the
; browser inherits the installer's Administrator token. Kill the link instead of the URL: the
; GPL text is not ours to edit ("changing it is not allowed").
;
; Installer pass only. electron-builder runs makensis twice, and on the BUILD_UNINSTALLER pass
; assistedInstaller.nsh skips every installer page (it is all inside !ifndef BUILD_UNINSTALLER)
; while still inserting MUI_UNPAGE_INSTFILES -- which would swallow the define below and fail
; with "Call must be used with function names starting with un.".
!ifndef BUILD_UNINSTALLER
Function DisableLicenseLinks
  Push $0
  Push $1
  Push $2
  ; The license RichEdit (id 1000) is on the inner dialog (class #32770), a child of
  ; $HWNDPARENT -- GetDlgItem on $HWNDPARENT itself returns 0. Same lookup electron-builder
  ; uses in its own LicenseShow (app-builder-lib/out/targets/nsis/nsisLicense.js).
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1000
  ${If} $1 <> 0
    ; NSIS opens URLs in response to the EN_LINK notification. Clearing ENM_LINK
    ; (0x04000000) from the event mask stops the control from ever sending it.
    SendMessage $1 0x043B 0 0 $2              ; EM_GETEVENTMASK
    IntOp $2 $2 & 0xFBFFFFFF
    SendMessage $1 0x0445 0 $2                ; EM_SETEVENTMASK
    SendMessage $1 0x045B 0 0                 ; EM_AUTOURLDETECT off
    ; Strip CFE_LINK across the document so the text also stops *looking* clickable.
    System::Call "*(i 0, i -1) i .r2"
    SendMessage $1 0x0437 0 $2                ; EM_EXSETSEL: select all
    System::Free $2
    System::Alloc 116
    Pop $2
    System::Call "*$2(i 116, i 0x20, i 0)"    ; cbSize, dwMask = CFM_LINK, dwEffects = 0
    SendMessage $1 0x0444 1 $2                ; EM_SETCHARFORMAT, SCF_SELECTION
    System::Free $2
    System::Call "*(i 0, i 0) i .r2"
    SendMessage $1 0x0437 0 $2                ; restore caret to start
    System::Free $2
  ${EndIf}
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

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

; Must stay LAST in this file. electron-builder includes installer.nsh in the script header,
; then inserts the licence page afterwards (assistedInstaller.nsh -> !insertmacro licensePage),
; which is the first MUI page it inserts -- so this define is the one it picks up. Defining it
; earlier does not work: MUI_UNPAGE_WELCOME above consumes MUI_PAGE_CUSTOMFUNCTION_SHOW.
; Installer pass only -- see the note on DisableLicenseLinks above.
!ifndef BUILD_UNINSTALLER
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW DisableLicenseLinks
!endif