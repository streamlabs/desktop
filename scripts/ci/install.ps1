# Run this script as administrator to setup enviroment on new CI machine:
# powershell install.ps1 your_gh_token host_user host_password

$token=$args[0]
$username=$args[1]
$password=$args[2]
$runnerName=$args[3]

if (-Not($token) -Or -Not($username) -Or -Not($password)) {
  echo "Provide a token, system user name and password";
  echo "Installation canceled";
  exit;
}

if (-Not($runnerName)) {
  echo "No runner name provided, defaulting to Computer Name"
  $runnerName=$env:COMPUTERNAME
}

# change dir to the script's dir
cd $PSScriptRoot;

# define paths
$workingDir = "C:\actions-runner"

# save token and working dir to env variable
[System.Environment]::SetEnvironmentVariable('GH_WORKING_DIR', $workingDir, [System.EnvironmentVariableTarget]::User)

echo "Download and install GH Actions Runner"
cd /
Remove-Item -Recurse -Force -ErrorAction Ignore agent
Remove-Item -Recurse -Force -ErrorAction Ignore actions-runner

$ErrorActionPreference = 'Stop'
# Create a folder under the drive root
New-Item -ItemType Directory -Force actions-runner | Out-Null
cd actions-runner
# Download the latest runner package
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.336.0/actions-runner-win-x64-2.336.0.zip -OutFile actions-runner-win-x64-2.336.0.zip
# Optional: Validate the hash
if((Get-FileHash -Path actions-runner-win-x64-2.336.0.zip -Algorithm SHA256).Hash.ToUpper() -ne 'd59123a43003e357b0805b5d0f611d0bd2f65ab67d51bd070dd4e7a0f685c162'.ToUpper()){ throw 'Computed checksum did not match' }
# Extract the installer
Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64-2.336.0.zip", "$PWD")

# lets us configure the screen resolution
echo "Download and install Amazon DCV Server"
Invoke-WebRequest -Uri https://d1uj6qtbmh3dt5.cloudfront.net/2025.0/Servers/nice-dcv-server-x64-Release-2025.0-20103.msi -OutFile "$PWD\nice-dcv-server-x64-Release-2025.0-20103.msi"
Start-Process msiexec.exe -ArgumentList "/i nice-dcv-server-x64-Release-2025.0-20103.msi /quiet /norestart /l*v dcv_install_msi.log" -Wait

echo "Configuring Screen Resolution"
reg.exe add HKEY_USERS\S-1-5-18\Software\GSettings\com\nicesoftware\dcv\display /v console-session-default-layout /t REG_SZ /d "[{'w':<1920>, 'h':<1080>, 'x':<0>, 'y': <0>}]" /f
reg.exe add HKEY_USERS\S-1-5-18\Software\GSettings\com\nicesoftware\dcv\display /v min-head-resolution /t REG_SZ /d "(1920, 1080)" /f

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
choco install nodejs --version=22.18.0

echo "Install Yarn"
choco install yarn

echo "Install Git for Windows"
choco install git.install

# Git's default PATH entry (<Git>\cmd) has git.exe but not bash.exe. The Actions
# runner resolves `shell: bash` off PATH, so add <Git>\bin explicitly.
# Deliberately NOT adding <Git>\usr\bin - it shadows Windows' find.exe/sort.exe.
$gitBin = "$env:ProgramFiles\Git\bin"
$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
if ($machinePath -notlike "*$gitBin*") {
  [System.Environment]::SetEnvironmentVariable('Path', "$machinePath;$gitBin", 'Machine')
}

# setup line-endings transform
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
              [System.Environment]::GetEnvironmentVariable('Path','User')
git config --global core.autocrlf false 

echo "Install 7zip"
choco install 7zip

echo "Install CMake"
choco install cmake --installargs 'ADD_CMAKE_TO_PATH=System'

echo "Install Visual Studio 2017 Build Tools"
choco install visualstudio2017buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools;includeRecommended;includeOptional"

echo "Install Visual Studio 2019 Build Tools"
choco install visualstudio2019buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools;includeRecommended;includeOptional"

# run registration script
echo "Configure GH Actions"
cmd.exe /c "$workingDir\config.cmd --unattended --replace --url https://github.com/streamlabs/desktop --token $token --labels desktop-frontend --name $runnerName --work _work"

# Disable the lock screen UI
$personalizationKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization"
New-Item -Path $personalizationKey -Force | Out-Null
Set-ItemProperty $personalizationKey -Name 'NoLockScreen' -Value 1 -Type DWord

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
Enable-PSRemoting -Force -SkipNetworkProfileCheck
Set-Item -Force wsman:\localhost\client\trustedhosts *
if (-Not (Get-NetFirewallRule -DisplayName "Allow inbound TCP port 5985" -ErrorAction Ignore)) {
  New-NetFirewallRule -DisplayName "Allow inbound TCP port 5985" -Direction inbound -LocalPort 5985 -Protocol TCP -Action Allow
}
Restart-Service WinRM

echo "Setup agent autostart"
$autoStartupRegPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty $autoStartupRegPath -Name 'StartGHRunner' -Value "powershell $workingDir\startup.ps1";


echo "Installation completed. Restart PC to take effect"

