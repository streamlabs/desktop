# register/unregister agent in Azure Pipelines
$command=$args[0]

if ($command -and ($command -ne 'remove')) {
    echo "Unknown command $command. Did you mean remove?";
    exit -1;
}

$token=[System.Environment]::GetEnvironmentVariable('AZURE_PIPELINES_TOKEN', [System.EnvironmentVariableTarget]::User)
$workingDir=[System.Environment]::GetEnvironmentVariable('AZURE_PIPELINES_WORKING_DIR', [System.EnvironmentVariableTarget]::User);

if (-Not($token)) {
  echo "Token is not found. Did you run the installation script?";
  exit -1;
}

if (-Not($workingDir)) {
  echo "Working dir is not set. Did you run the installation script?";
  exit -1;
}


# remove agent from the pool
cd $workingDir
.\config remove --unattended --auth pat --token $token

# register aggent in the pool
if ($command -ne 'remove') {
 $pool = 'Streamlabs Desktop Frontend'
 $publicIp = (Invoke-RestMethod ipinfo.io/ip).trim()
  .\config --unattended --url https://dev.azure.com/streamlabs --auth pat --token $token --agent "$env:computername $publicIp" --pool $pool
 }
