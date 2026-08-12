!include MUI2.nsh

; Only ever for a file we just wrote. On one we merely found, this would make
; somebody else's file look administrator-installed to the app, which decides
; what to trust on exactly that basis. /setowner is the one that matters:
; CopyFileW leaves the copy inheriting from the destination rather than
; carrying the source's ACEs, so /reset only restates what the directory
; already grants.
!macro SecureHookFile FileName
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$R7\${FileName}" /setowner "*S-1-5-32-544" /Q'
  Pop $R8
  ${If} $R8 <> 0
    DetailPrint "Could not set the owner of ${FileName}"
    StrCpy $R6 "unverified"
  ${Else}
    nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$R7\${FileName}" /reset /Q'
    Pop $R8
    ${If} $R8 <> 0
      DetailPrint "Could not reset the permissions on ${FileName}"
      StrCpy $R6 "unverified"
    ${EndIf}
  ${EndIf}
!macroend

; Copies one graphics hook file from $R9 into the locked-down shared directory
; $R7, setting $R6 if it could not be put in place right now.
;
; $R9 is the installer's own plugin directory, extracted from the signed
; installer. Do not copy these out of $INSTDIR: the user chooses that path, so
; a standard user may be able to rewrite it while we are running elevated.
;
; Delete first, then copy without overwrite. An entry left there while the
; directory was writable may be a hard link, and writing through it would put
; our bytes into the link target - an arbitrary write, since we are elevated.
; CopyFileW rather than CopyFiles, which takes a destination directory and
; gives no usable return value.
;
; The vulkan layer pulls the hook into anything that renders, so the target may
; be loaded right now; a locked file is staged beside it and swapped on reboot.
!macro InstallHookFile FileName
  Delete "$R7\${FileName}"
  System::Call 'kernel32::CopyFileW(w "$R9\${FileName}", w "$R7\${FileName}", i 1) i .s'
  Pop $R8
  ${If} $R8 == 0
    Delete "$R7\${FileName}.new"
    System::Call 'kernel32::CopyFileW(w "$R9\${FileName}", w "$R7\${FileName}.new", i 1) i .s'
    Pop $R8
    ${If} $R8 == 0
      DetailPrint "Could not install ${FileName} into $R7"
    ${Else}
      !insertmacro SecureHookFile "${FileName}.new"
      Rename /REBOOTOK "$R7\${FileName}.new" "$R7\${FileName}"
      DetailPrint "${FileName} could not be replaced now; it is staged for the next reboot"
    ${EndIf}
    StrCpy $R6 "unverified"
  ${Else}
    !insertmacro SecureHookFile "${FileName}"
  ${EndIf}
!macroend

; Moves an existing hook directory aside instead of repairing it where it
; stands, and records the result in $R4 (empty if nothing was moved) and $R6.
;
; An ACL change does not revoke handles opened before it, so whoever created
; the directory could rename the hardened one away afterwards and put their own
; back at the same path.
;
; This happens whenever a directory exists, because unlike the app and the
; updater we cannot tell an administrator-provisioned one from a planted one -
; that needs an ownership check and NSIS has no plugin for it here. So the
; installer cannot take part in the newest-hook-wins arbitration the other two
; do; the updater settles that on its next run.
!macro QuarantineHookDir
  StrCpy $R4 ""
  System::Call 'kernel32::GetFileAttributesW(w "$R7") i .s'
  Pop $R8
  ${If} $R8 <> -1
    StrCpy $R5 0
    ${Do}
      ClearErrors
      Rename "$R7" "$R7.quarantine$R5"
      ${IfNot} ${Errors}
        StrCpy $R4 "$R7.quarantine$R5"
        ${ExitDo}
      ${EndIf}
      IntOp $R5 $R5 + 1
    ${LoopUntil} $R5 >= 10
    ClearErrors

    ${If} $R4 == ""
      DetailPrint "Could not move the existing hook directory aside"
      StrCpy $R6 "unverified"
    ${Else}
      DetailPrint "Moved the existing hook directory to $R4"
      ; Only names we own. RMDir /r would follow a junction left inside and
      ; delete whatever is on the other side of it.
      Delete /REBOOTOK "$R4\graphics-hook32.dll"
      Delete /REBOOTOK "$R4\graphics-hook64.dll"
      Delete /REBOOTOK "$R4\obs-vulkan32.json"
      Delete /REBOOTOK "$R4\obs-vulkan64.json"
      Delete /REBOOTOK "$R4\graphics-hook32.dll.new"
      Delete /REBOOTOK "$R4\graphics-hook64.dll.new"
      Delete /REBOOTOK "$R4\obs-vulkan32.json.new"
      Delete /REBOOTOK "$R4\obs-vulkan64.json.new"
      RMDir /REBOOTOK "$R4"
    ${EndIf}
  ${EndIf}
!macroend

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

  ; The graphics hook is injected into other processes out of a shared
  ; directory, so only administrators may write to it. We are the elevated part
  ; of the install; the app runs unelevated and cannot provision this. Releases
  ; up to 1.21 granted BUILTIN\Users write access here, so an existing
  ; directory may be owned by, and full of files planted by, a standard user.
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  StrCpy $R6 ""

  ; Not the ProgramData environment variable, which is inherited from whoever
  ; launched us. Under the all-users context $APPDATA is CSIDL_COMMON_APPDATA,
  ; which comes from the shell.
  SetShellVarContext all
  StrCpy $R7 "$APPDATA\obs-studio-hook"

  ; A junction left behind by whoever owned this directory before us would send
  ; every step below to its target instead. RMDir without /r unlinks the
  ; junction and leaves whatever it pointed at alone.
  System::Call 'kernel32::GetFileAttributesW(w "$R7") i .s'
  Pop $R8
  ${If} $R8 <> -1
    IntOp $R8 $R8 & 0x400 ; FILE_ATTRIBUTE_REPARSE_POINT
    ${If} $R8 <> 0
      RMDir "$R7"
      ; if it is still there, stop rather than operate through it
      System::Call 'kernel32::GetFileAttributesW(w "$R7") i .s'
      Pop $R8
      ${If} $R8 <> -1
        IntOp $R8 $R8 & 0x400
        ${If} $R8 <> 0
          DetailPrint "$R7 is a reparse point that could not be unlinked"
          StrCpy $R6 "unverified"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $R6 == ""
    !insertmacro QuarantineHookDir
  ${EndIf}

  ${If} $R6 == ""
    ; Same descriptor, and the same reasoning, as hook_dir_create() in
    ; obs-studio's hook-dir-security.h. It goes on at creation rather than being
    ; fixed up by the icacls calls below: a directory created under
    ; %ProgramData% inherits an entry letting users create files in it, and that
    ; would stand for as long as it takes to spawn icacls. A failure here means
    ; somebody won the name after quarantine, and must not be repaired in place.
    System::Call 'advapi32::ConvertStringSecurityDescriptorToSecurityDescriptorW(w "O:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FRFX;;;BU)(A;OICI;FRFX;;;AC)(A;OICI;FRFX;;;S-1-15-2-2)", i 1, *p .r13, p 0) i .s'
    Pop $R8
    ${If} $R8 == 0
      DetailPrint "Could not build the hook directory descriptor"
      StrCpy $R6 "unverified"
    ${Else}
      ; SECURITY_ATTRIBUTES {nLength, lpSecurityDescriptor, bInheritHandle};
      ; 12 bytes because NSIS installers are 32-bit
      System::Call '*(i 12, p r13, i 0) p .r12'
      System::Call 'kernel32::CreateDirectoryW(w "$R7", p r12) i .s'
      Pop $R8
      System::Free $R2
      System::Call 'kernel32::LocalFree(p r13) p'
      ${If} $R8 == 0
        DetailPrint "Could not create a new hook directory; the name may have been recreated"
        StrCpy $R6 "unverified"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $R6 == ""
    ; icacls by full path: this process is elevated, and a bare name would be
    ; resolved against the search path.
    ;
    ; No /T anywhere. Recursing through a directory that standard users could
    ; write until a moment ago means walking whatever links they left, and
    ; icacls follows link targets. The four files are handled individually once
    ; we have written them.
    ;
    ; SIDs rather than account names, which are localized:
    ;   S-1-5-18       SYSTEM
    ;   S-1-5-32-544   Administrators
    ;   S-1-5-32-545   Users
    ;   S-1-15-2-1     ALL APPLICATION PACKAGES
    ;   S-1-15-2-2     ALL RESTRICTED APPLICATION PACKAGES
    ; The last two are what lets an AppContainer capture target load the hook.
    nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$R7" /setowner "*S-1-5-32-544" /Q'
    Pop $R8
    ${If} $R8 <> 0
      DetailPrint "Could not take ownership of $R7"
      StrCpy $R6 "unverified"
    ${EndIf}
  ${EndIf}

  ${If} $R6 == ""
    nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$R7" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)(F)" "*S-1-5-32-544:(OI)(CI)(F)" "*S-1-5-32-545:(OI)(CI)(RX)" "*S-1-15-2-1:(OI)(CI)(RX)" "*S-1-15-2-2:(OI)(CI)(RX)"'
    Pop $R8
    ${If} $R8 <> 0
      DetailPrint "Could not secure $R7"
      StrCpy $R6 "unverified"
    ${EndIf}
  ${EndIf}

  ${If} $R6 == ""
    SetOutPath "$PLUGINSDIR\obs-studio-hook"
    File /oname=graphics-hook32.dll "${PROJECT_DIR}\node_modules\obs-studio-node\data\obs-plugins\win-capture\graphics-hook32.dll"
    File /oname=graphics-hook64.dll "${PROJECT_DIR}\node_modules\obs-studio-node\data\obs-plugins\win-capture\graphics-hook64.dll"
    File /oname=obs-vulkan32.json "${PROJECT_DIR}\node_modules\obs-studio-node\data\obs-plugins\win-capture\obs-vulkan32.json"
    File /oname=obs-vulkan64.json "${PROJECT_DIR}\node_modules\obs-studio-node\data\obs-plugins\win-capture\obs-vulkan64.json"
    SetOutPath "$INSTDIR"

    StrCpy $R9 "$PLUGINSDIR\obs-studio-hook"
    !insertmacro InstallHookFile "graphics-hook32.dll"
    !insertmacro InstallHookFile "graphics-hook64.dll"
    !insertmacro InstallHookFile "obs-vulkan32.json"
    !insertmacro InstallHookFile "obs-vulkan64.json"
  ${EndIf}

  ${If} $R6 != ""
    ; A file we could not replace is still whatever was on disk, which on an
    ; already-compromised machine is the planted hook. The loader hands this
    ; directory to every vulkan process on the machine, so it must not point
    ; here. The app re-registers the layer once it sees a directory it trusts.
    SetRegView 64
    DeleteRegValue HKLM "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$R7\obs-vulkan64.json"
    DeleteRegValue HKCU "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$R7\obs-vulkan64.json"
    SetRegView 32
    DeleteRegValue HKLM "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$R7\obs-vulkan32.json"
    DeleteRegValue HKCU "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$R7\obs-vulkan32.json"
    SetRegView lastused
  ${EndIf}

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1

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

    ; The same shell-resolved path customInstall provisions, not a literal
    ; C:\ProgramData - that can be relocated.
    SetShellVarContext all

    ; The layer registration outlives whatever it names, and the loader hands
    ; that directory to every vulkan process on the machine, elevated ones
    ; included. So it goes before the files do, never after: at no point may an
    ; enabled entry point somewhere we no longer stand behind.
    SetRegView 64
    DeleteRegValue HKLM "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$APPDATA\obs-studio-hook\obs-vulkan64.json"
    DeleteRegValue HKCU "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$APPDATA\obs-studio-hook\obs-vulkan64.json"
    SetRegView 32
    DeleteRegValue HKLM "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$APPDATA\obs-studio-hook\obs-vulkan32.json"
    DeleteRegValue HKCU "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$APPDATA\obs-studio-hook\obs-vulkan32.json"
    SetRegView lastused

    System::Call 'kernel32::GetFileAttributesW(w "$APPDATA\obs-studio-hook") i .s'
    Pop $1
    ${If} $1 <> -1
      IntOp $1 $1 & 0x400 ; FILE_ATTRIBUTE_REPARSE_POINT
      ${If} $1 <> 0
        ; Nothing under this path is ours - it all resolves somewhere else.
        ; RMDir without /r unlinks the junction and leaves the target alone.
        RMDir "$APPDATA\obs-studio-hook"
      ${Else}
        ; Only the names we installed, and no RMDir /r: that follows a junction
        ; left inside the directory and deletes what is on the other side of
        ; it, and we are elevated. The directory not being a reparse point says
        ; nothing about what is under it.
        ;
        ; REBOOTOK because the hook may be loaded into a game right now.
        ; see: https://nsis.sourceforge.io/Reference/Delete
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\graphics-hook32.dll"
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\graphics-hook64.dll"
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\obs-vulkan32.json"
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\obs-vulkan64.json"
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\graphics-hook32.dll.new"
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\graphics-hook64.dll.new"
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\obs-vulkan32.json.new"
        Delete /REBOOTOK "$APPDATA\obs-studio-hook\obs-vulkan64.json.new"

        ; And the container, if those were the last things in it - still no /r.
        ; Keeping it would be the hostile choice: the directory is ours only
        ; while we are installed, and an unelevated OBS-derived application
        ; cannot write into an administrator-owned one. Upstream's
        ; update_hook_file() fails the copy and then never reaches
        ; init_vulkan_registry(), so a hardened leftover costs the next
        ; application vulkan capture for good. Nothing points at the name we
        ; are releasing; the registrations went first.
        RMDir /REBOOTOK "$APPDATA\obs-studio-hook"
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd
