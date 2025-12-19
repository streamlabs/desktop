# start agent
$workingDir=[System.Environment]::GetEnvironmentVariable('AZURE_PIPELINES_WORKING_DIR', [System.EnvironmentVariableTarget]::User);

if (-Not($workingDir)) {
  echo "Working dir is not set. Did you run the installation script?";
  exit -1;
}
$workingDir = "C:\agent" # Replace with your actual agent working directory
$timeout = New-TimeSpan -Minutes 60 # Set your desired timeout duration
$agentProcess = Start-Process -NoNewWindow -PassThru -FilePath "$workingDir\run.cmd" -ArgumentList "--once"

$agentStarted = Get-Date

# Poll the agent process status in a loop
While ($agentProcess.HasExited -ne $true) {
    Start-Sleep -Seconds 30 # Check every 30 seconds

    # If the current time exceeds the start time by the timeout duration, stop the agent
    If ((Get-Date) -gt $agentStarted.Add($timeout)) {
        Write-Host "Agent is still running after timeout. Forcing exit..."
        Stop-Process -Id $agentProcess.Id -Force
        Break
    }
}

Write-Host "Agent process has completed."

