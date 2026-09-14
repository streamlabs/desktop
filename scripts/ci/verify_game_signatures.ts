import * as path from 'path';
import execa from 'execa';
import { promises as fs } from 'fs';

if (process.platform !== 'win32') {
  console.error('verify_game_signatures.ts can only be run on Windows runners.');
  process.exit(1);
}
// Expected Authenticode publisher (certificate simple name) of the game capture binaries.
const GAME_CAPTURE_PUBLISHER = 'OBS Project, LLC';

// List of the binaries needed for game capture
const gameCaptureDependencies = [
  'get-graphics-offsets32.exe',
  'get-graphics-offsets64.exe',
  'graphics-hook32.dll',
  'graphics-hook64.dll',
  'inject-helper32.exe',
  'inject-helper64.exe',
];

// Verifies the Authenticode signature of Windows game capture binaries using PowerShell.
// Exits the process with code 1 if a binary is unsigned/tampered/untrusted or not published by 'OBS Project, LLC'.
async function verifyGameCaptureBinarySignatures(dir: string): Promise<void> {
  for (const bin of gameCaptureDependencies) {
    const filePath = path.join(dir, 'data', 'obs-plugins', 'win-capture', bin);
    try {
      await fs.access(filePath);
    } catch {
      console.error(`Signature verification failed for ${bin}: file not found at ${filePath}`);
      process.exit(1);
    }
    const escapedPath = filePath.replace(/'/g, "''");
    // The publisher is compared against the certificate's simple name rather than against the
    // raw Subject DN: Windows quotes any RDN value containing a comma, so the DN reads
    // CN="OBS Project, LLC", ... and a bare `CN=OBS Project, LLC` pattern never matches it.
    // Exit codes: 1 = unsigned/tampered/untrusted, 2 = wrong publisher, 0 = valid.
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `try { $sig = Get-AuthenticodeSignature -LiteralPath '${escapedPath}' } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`,
      'if ($null -eq $sig -or $null -eq $sig.SignerCertificate) { [Console]::Error.WriteLine("no signature"); exit 1 }',
      "if ($sig.Status -ne 'Valid') { [Console]::Error.WriteLine(\"status=$($sig.Status): $($sig.StatusMessage)\"); exit 1 }",
      "$cn = $sig.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)",
      `if ($cn -cne '${GAME_CAPTURE_PUBLISHER}') { [Console]::Error.WriteLine("publisher=$cn"); exit 2 }`,
      'exit 0',
    ].join('; ');
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

    try {
      await execa(
        'powershell',
        ['-NonInteractive', '-NoProfile', '-EncodedCommand', encodedCommand],
        {
          stdio: 'pipe',
          timeout: 30000,
        },
      );
    } catch (e: unknown) {
      const err = e as { exitCode?: number; timedOut?: boolean; stderr?: string };
      // powershell.exe wraps redirected stderr in a CLIXML envelope; drop it so the real
      // message (status=..., publisher=...) is what gets logged.
      const stderr = err.stderr || '';
      const clixmlDetail = stderr.match(/<S[^>]*>([^<]*)<\/S>/)?.[1];
      const detail =
        clixmlDetail ||
        stderr
          .split(/\r?\n/)
          .map(line => line.trim())
          .find(
            line =>
              line &&
              !line.startsWith('#< CLIXML') &&
              !line.startsWith('<Objs') &&
              !line.startsWith('<Obj'),
          ) ||
        'no details';
      if (err.timedOut) {
        console.error(`Signature verification failed for ${bin}: PowerShell timed out`);
      } else if (err.exitCode === 2) {
        console.error(
          `Signature verification failed for ${bin}: publisher is not "${GAME_CAPTURE_PUBLISHER}" (${detail})`,
        );
      } else {
        console.error(
          `Signature verification failed for ${bin}: unsigned, tampered, or untrusted chain (${detail})`,
        );
      }
      process.exit(1);
    }

    console.log(`Signature OK: ${bin}`);
  }
}

const node_modules = path.join(process.cwd(), 'node_modules');
const osnDir = path.join(node_modules, 'obs-studio-node');
void verifyGameCaptureBinarySignatures(osnDir).catch(err => {
  console.error('Signature verification failed:', err);
  process.exit(1);
});
