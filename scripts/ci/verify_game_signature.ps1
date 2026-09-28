<#
.SYNOPSIS
Verifies the Authenticode signature of a single Windows game capture binary.

.DESCRIPTION
Checks that the file is signed, that the signature is valid (trusted chain, untampered),
that the signing certificate belongs to the expected publisher, and that the signer
certificate is one of the allowlisted ones.

Exit codes: 0 = valid, 1 = unsigned/tampered/untrusted, 2 = wrong publisher,
3 = unexpected signer certificate.

.PARAMETER FilePath
Full path to the binary to verify.

.PARAMETER ExpectedPublisher
Expected certificate simple name, e.g. "OBS Project, LLC".

.PARAMETER AllowedThumbprints
Comma-separated SHA256 fingerprints of the accepted signer certificates.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$FilePath,
  [Parameter(Mandatory = $true)][string]$ExpectedPublisher,
  [Parameter(Mandatory = $true)][string]$AllowedThumbprints
)

$ErrorActionPreference = 'Stop'

try {
  $sig = Get-AuthenticodeSignature -LiteralPath $FilePath
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}

if ($null -eq $sig -or $null -eq $sig.SignerCertificate) {
  [Console]::Error.WriteLine('no signature')
  exit 1
}

if ($sig.Status -ne 'Valid') {
  [Console]::Error.WriteLine("status=$($sig.Status): $($sig.StatusMessage)")
  exit 1
}

# The publisher is compared against the certificate's simple name rather than against the
# raw Subject DN: Windows quotes any RDN value containing a comma, so the DN reads
# CN="OBS Project, LLC", ... and a bare `CN=OBS Project, LLC` pattern never matches it.
$nameType = [System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName
$cn = $sig.SignerCertificate.GetNameInfo($nameType, $false)
if ($cn -cne $ExpectedPublisher) {
  [Console]::Error.WriteLine("publisher=$cn")
  exit 2
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha256.ComputeHash($sig.SignerCertificate.RawData)
$thumbprint = [BitConverter]::ToString($hash).Replace('-', '').ToUpperInvariant()
if ([string]::IsNullOrWhiteSpace($thumbprint)) {
  [Console]::Error.WriteLine('thumbprint=missing')
  exit 3
}

$allowed = $AllowedThumbprints -split ',' | ForEach-Object { $_.Trim() }
if ($allowed -notcontains $thumbprint) {
  [Console]::Error.WriteLine("thumbprint=$thumbprint")
  exit 3
}

exit 0
