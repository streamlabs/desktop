<#
.SYNOPSIS
  Cap Streamlabs' streaming upload to test stream-health monitoring under a constrained network.

.DESCRIPTION
  Uses Windows Policy-based QoS to throttle only the outbound traffic of obs64.exe (the process
  that encodes and sends the stream). Nothing else on the machine is affected: local apps, the
  LLM, browsers and so on keep full speed. Run from an elevated (Administrator) PowerShell.

.EXAMPLE
  .\net-throttle.ps1 -Kbps 2500     # cap the stream upload at 2,500 kbps
  .\net-throttle.ps1 -Status        # show whether the cap is active
  .\net-throttle.ps1 -Off           # remove the cap

.NOTES
  Pick a cap well below the stream's bitrate (e.g. 2500 for a 6000 kbps stream) to cause
  dropped frames; lowering the stream bitrate below the cap then clears them.
#>
[CmdletBinding(DefaultParameterSetName = 'Status')]
param(
  [Parameter(ParameterSetName = 'On', Mandatory = $true)]
  [ValidateRange(100, 1000000)]
  [int]$Kbps,

  [Parameter(ParameterSetName = 'Off', Mandatory = $true)]
  [switch]$Off,

  [Parameter(ParameterSetName = 'Status')]
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$PolicyName = 'StreamUploadThrottle'
$App = 'obs64.exe'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and $PSCmdlet.ParameterSetName -ne 'Status') {
  Write-Error 'Run this from an elevated PowerShell (right-click > Run as administrator).'
}

function Get-Throttle {
  Get-NetQosPolicy -Name $PolicyName -ErrorAction SilentlyContinue
}

switch ($PSCmdlet.ParameterSetName) {
  'On' {
    if (Get-Throttle) { Remove-NetQosPolicy -Name $PolicyName -Confirm:$false }
    New-NetQosPolicy -Name $PolicyName `
      -AppPathNameMatchCondition $App `
      -ThrottleRateActionBitsPerSecond ([uint64]$Kbps * 1000) | Out-Null
    Write-Host "Stream upload capped at $Kbps kbps for $App. Undo with: .\net-throttle.ps1 -Off"
  }
  'Off' {
    if (Get-Throttle) {
      Remove-NetQosPolicy -Name $PolicyName -Confirm:$false
      Write-Host 'Stream upload cap removed.'
    } else {
      Write-Host 'No stream upload cap was active.'
    }
  }
  'Status' {
    $p = Get-Throttle
    if ($p) {
      $kbps = [math]::Round($p.ThrottleRateActionBitsPerSecond / 1000)
      Write-Host "Active: $App capped at $kbps kbps (policy '$PolicyName')."
    } else {
      Write-Host 'No stream upload cap is active.'
    }
  }
}
