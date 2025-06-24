# Run this script as administrator to setup enviroment on new CI machine:
# powershell install.ps1 your_azure_token host_user host_password

$token=$args[0]
$username=$args[1]
$password=$args[2]

if (-Not($token) -Or -Not($username) -Or -Not($password)) {
  echo "Provide a token, system user name and password";
  echo "Installation canceled";
  exit;
}

# change dir to the script's dir
cd $PSScriptRoot;

# define paths
$workingDir = "C:\agent"
$agentPath = "$workingDir\run.cmd"
$registerAgentScriptName = "register-agent.ps1"


# save token and working dir to env variable
[System.Environment]::SetEnvironmentVariable('AZURE_PIPELINES_TOKEN', $token, [System.EnvironmentVariableTarget]::User)
[System.Environment]::SetEnvironmentVariable('AZURE_PIPELINES_WORKING_DIR', $workingDir, [System.EnvironmentVariableTarget]::User)

echo "Download and install Azure Agent"
cd /
Remove-Item -Recurse -Force -ErrorAction Ignore agent
mkdir agent ; cd agent;
Invoke-WebRequest -Uri https://download.agent.dev.azure.com/agent/4.255.0/vsts-agent-win-x64-4.255.0.zip -OutFile "$PWD\agent.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD\agent.zip", "$PWD")


#copy scripts to the workingDir
Copy-Item -Path "$PSScriptRoot\*" -Destination $workingDir


echo "Install Chocolately"
if (-NOT(Get-Command "choco" -errorAction SilentlyContinue)) {
  Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'));
  choco feature enable -n allowGlobalConfirmation
}

echo "Install Visual C++ Redistributable (required for node-win32-np module)"
choco install vcredist2015

echo "Install Nodejs"
choco install nodejs --version=12.16.2

echo "Install Yarn"
choco install yarn

echo "Install Git for Windows"
choco install git.install
git config --global core.autocrlf false # setup line-ednings transform

echo "Install 7zip"
choco install 7zip

echo "Install CMake"
choco install cmake --installargs 'ADD_CMAKE_TO_PATH=System'

echo "Install Visual Studio 2017 Build Tools"
choco install visualstudio2017buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools;includeRecommended;includeOptional"

echo "Install Visual Studio 2019 Build Tools"
choco install visualstudio2019buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools;includeRecommended;includeOptional"

# run registration script
echo "Configure Azure Agent"
."$workingDir\$registerAgentScriptName"

# Disable the lock screen to prevent the PC locking after the end of the RDP session
Set-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization" -Name 'NoLockScreen' -Value 1;

# Azure Agent has --AutoLogon option to add Agent to autostartup
# But it doesn't allow to pass any arguments to the Agent
# So call own implementation of AutoLogon here
echo "Setup auto-login when system starts"
$RegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty $RegPath "AutoAdminLogon" -Value "1" -type String
Set-ItemProperty $RegPath "DefaultUsername" -Value $username -type String
Set-ItemProperty $RegPath "DefaultPassword" -Value "$password" -type String

# Setup WinRM for remote connections
# Trusted hosts and ports must be confgured on the level above
# Use the example below to run restart all agents
#   $LiveCred = Get-Credential
#   Invoke-Command -Computer Agent1, Agent2, Agent3 -Credential $LiveCred -ScriptBlock {Restart-Computer -Force}
Enable-PSRemoting -Force
Set-Item -Force wsman:\localhost\client\trustedhosts *
New-NetFirewallRule -DisplayName "Allow inbound TCP port 5985" -Direction inbound -LocalPort 5985 -Protocol TCP -Action Allow
Restart-Service WinRM

echo "Setup agent autostart"
$autoStartupRegPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty $autoStartupRegPath -Name 'RegisterAzureAgent' -Value "powershell $workingDir\startup.ps1";


echo "Installation completed. Restart PC to take effect"
