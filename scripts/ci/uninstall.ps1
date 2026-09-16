# remove scripts from autostartup
$regPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run";
Remove-ItemProperty $regPath -Name 'StartGHRunner' -ErrorAction Ignore
