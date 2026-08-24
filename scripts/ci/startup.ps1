# run this file on windows startup

cd $PSScriptRoot;

# start agent and run one job
."./start-agent.ps1";

Restart-Computer -Force
