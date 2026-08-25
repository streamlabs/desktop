# start agent
$workingDir=[System.Environment]::GetEnvironmentVariable('GH_WORKING_DIR', [System.EnvironmentVariableTarget]::User);

if (-Not($workingDir)) {
  echo "Working dir is not set. Did you run the installation script?";
  exit -1;
}
$agentPath = "$workingDir\run.cmd"

$agentProcess = Start-Process -NoNewWindow -PassThru -FilePath $agentPath
$null = $agentProcess.Handle

$agentStarted = Get-Date

# Restart computer if it detects that the jobs process has stopped running
$agentProcess.WaitForExit()
$uptime = (Get-Date) - $agentStarted
Write-Host "Runner exited with code $($agentProcess.ExitCode) after $($uptime.TotalMinutes) minutes."
if ($uptime.TotalMinutes -lt 2) {
Write-Host "Runner exited too quickly - not rebooting. Investigate manually."
exit 1
}
Restart-Computer -Force
