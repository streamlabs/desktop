# start agent
$workingDir=[System.Environment]::GetEnvironmentVariable('GH_WORKING_DIR', [System.EnvironmentVariableTarget]::User);

if (-Not($workingDir)) {
  echo "Working dir is not set. Did you run the installation script?";
  exit -1;
}
$agentService = Start-Service "actions.runner.*" -PassThru

$agentStarted = Get-Date

# Poll the agent process status in a loop
While ($agentService.Status -ne 1) {
    Start-Sleep -Seconds 30 # Check every 30 seconds
    $runnerStatus = Get-Service "actions.runner.*"

    # Check if the runners status is "Offline" which on the running machine indicates it cannot communicate with GH
    # Statuses here: https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/monitor-and-troubleshoot#checking-the-status-of-a-self-hosted-runner
    If ($runnerStatus -eq "Offline") {
        Write-Host "Agent has gone offline. Forcing exit..."
        Stop-Service "actions.runner.*"
        Write-Host "Agent process is offline, restarting computer."
        Restart-Computer -Force
        Break
    }
}

