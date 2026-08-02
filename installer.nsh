!include MUI2.nsh

; Ownership and the DACL are reset only for a file we actually wrote. Doing it
; for one we merely found would take somebody else's file and make it look
; administrator-installed to the app, which decides what to trust on exactly
; that basis. CopyFileW can carry explicit ACEs from the source, so changing
; only the owner is not enough: /reset makes the file inherit the protected
; directory descriptor.
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

; Copies one graphics hook file into the locked-down shared directory ($R7)
; from the install directory ($R9), setting $R6 if the file could not be put in
; place right now.
;
; Each destination is deleted before it is written, and the copy refuses to
; overwrite. An entry left there while the directory was writable may be a hard
; link sharing its data with some other file, and copying onto it would put our
; bytes into that file - an arbitrary write, since the installer is elevated.
; Deleting removes the directory entry, not the link target.
;
; CopyFiles takes a destination directory rather than a destination file, which
; the staged path needs, so this goes through CopyFileW directly for a real
; return value. The target can be loaded by another process at this very moment
; - the vulkan layer pulls the hook into anything that renders - so a locked
; file is staged beside it and swapped in by Windows on the next reboot. That
; swap is link-safe: it replaces the directory entry rather than writing
; through it, and the file we leave behind until then keeps whoever put it
; there as its owner, so the app will not use it.
;
; The source is embedded in the signed installer and extracted to its private
; plugin directory. Do not copy these files out of $INSTDIR: the installer lets
; the user choose that path, so a standard user may be able to rewrite it while
; this elevated process is running.
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
      DetailPrint "${FileName} is in use; it will be replaced on the next reboot"
    ${EndIf}
    StrCpy $R6 "unverified"
  ${Else}
    !insertmacro SecureHookFile "${FileName}"
  ${EndIf}
!macroend

; Moves an existing hook directory aside instead of repairing it where it
; stands, and records the result in $R4 (empty if nothing was moved) and $R6.
;
; Rewriting a DACL does not revoke handles that are already open. Whoever
; created the directory can hold one with delete access, let us harden it, and
; rename it away afterwards - then put their own back at the same path. The app
; would reject what it finds there, but the vulkan loader does not repeat its
; checks. A directory that did not exist when they opened their handle is not
; reachable that way.
;
; Unlike the app and the updater we cannot tell an administrator-provisioned
; directory from a planted one - that needs an ownership check, and NSIS has no
; plugin for it here - so this happens whenever one exists. It does mean the
; installer cannot take part in the newest-hook-wins arbitration the other two
; do: nothing survives to arbitrate against. The updater sorts that out on its
; next run, and it runs far more often than this does.
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
      ; Only the names we know. RMDir /r would follow a junction left inside
      ; and delete whatever is on the other side of it. Anything else in there
      ; keeps the directory alive, which is untidy but harmless.
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
  ; directory, so only administrators may write to it. We are the elevated
  ; part of the install; the app itself runs unelevated and cannot provision
  ; this. Releases up to 1.21 granted BUILTIN\Users write access here, so an
  ; existing directory may be owned by, and full of files planted by, a
  ; standard user.
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

  ; Not the ProgramData environment variable: that is inherited from whoever
  ; launched us, so a standard user could point this at a directory of their
  ; choosing and have an elevated process provision it. Under the all-users
  ; context $APPDATA is CSIDL_COMMON_APPDATA, which comes from the shell.
  SetShellVarContext all
  StrCpy $R7 "$APPDATA\obs-studio-hook"

  ; A junction left behind by whoever owned this directory before us would send
  ; the icacls calls and the copies below to its target instead. RMDir without
  ; /r unlinks the junction itself and leaves whatever it pointed at alone.
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
    ; Only accept a directory created by this call. If a standard user wins
    ; the name after quarantine, hardening their directory would leave any
    ; delete-capable handle they already opened alive.
    ;
    ; The descriptor goes on at creation rather than being fixed up by the
    ; icacls calls below. A directory created under %ProgramData% inherits an
    ; entry letting users create files in it, and that would stand for as long
    ; as it takes to spawn icacls. This is the same descriptor, and the same
    ; reasoning, as hook_dir_create() in obs-studio's hook-dir-security.h.
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
    ; icacls follows link targets by default. Only the directory itself is
    ; touched here; the four files are handled individually once we have
    ; written them.
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
    ; already-compromised machine is the planted hook. The directory is locked
    ; down now so nobody can refresh the plant, but we must not keep pointing
    ; the vulkan loader at it - it hands this directory to every vulkan
    ; process on the machine. The app re-registers the layer once it sees a
    ; directory it trusts.
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
    ; REBOOTOK flag is required, because files might get injected into a game process and system may prevent their removal
    ; see: https://nsis.sourceforge.io/Reference/RMDir
    RMDir /r /REBOOTOK "C:\\ProgramData\\obs-studio-hook"
  ${EndIf}
FunctionEnd
