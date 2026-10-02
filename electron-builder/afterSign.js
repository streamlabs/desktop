const { notarize } = require('@electron/notarize');
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const os = require('os');
// Wrapper around signtool.exe. We use the package rather than a bare `signtool`
// command because signtool.exe ships in the Windows SDK and is only on PATH inside a
// Developer Command Prompt — not in the environment electron-builder hands to hooks.
// The package bundles its own signtool.exe and resolves it by path.
const signtool = require('signtool');

async function notarizeMac(context) {
  if (process.env.SLOBS_NO_NOTARIZE) return;
  if (process.platform !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  if (!fs.existsSync(appPath)) {
    throw new Error(`Cannot find application for notarization at: ${appPath}`);
  }

  console.log(`Notarizing app found at: ${appPath}`);
  console.log('This can take several minutes.');

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: process.env['APPLE_ID'],
    appleIdPassword: process.env['APPLE_APP_PASSWORD'],
    teamId: process.env['APPLE_TEAM_ID'],
  });

  console.log('Notarization finished.');
}

// signtool reports diagnostics as a banner on stdout rather than a single stderr line,
// e.g. "SignTool Error: No signature found." for an unsigned file vs. a chain-of-trust
// complaint for one signed by an untrusted cert. Those distinctions are the whole point
// of the check, so pull the meaningful line out instead of discarding the output.
function signtoolReason(err) {
  const lines = `${err.stdout || ''}\n${err.stderr || ''}`
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^=+$/.test(line));

  return lines.find(line => line.startsWith('SignTool Error:')) || lines.pop() || err.message;
}

async function afterPackWin() {
  if (process.env.SLOBS_NO_SIGN) return;

  const signingPath = path.join(os.tmpdir(), 'sldesktopsigning');

  if (!fs.existsSync(signingPath)) {
    throw new Error('EXPECTED TO SIGN BINARIES BUT SIGNING MANIFEST IS MISSING');
  }

  cp.execSync(`logisign client --client logitech-cpg-sign-client --app streamlabs --filelist ${signingPath}`, { stdio: 'inherit' });

  // A zero exit from logisign does not prove every file in the batch was signed.
  // The manifest is the exact list electron-builder asked us to sign, so verify
  // each entry rather than trust the batch. Without this, a partial failure ships
  // unsigned binaries in an otherwise successful build.
  // afterPack creates this manifest and the sign hook appends to it with \n, but logisign
  // reads and could rewrite it in between, so don't assume we still own its line endings.
  // A stray \r would make every path a "file not found" — the same uniform, misleading
  // failure this check exists to distinguish from a real signing problem.
  const files = fs
    .readFileSync(signingPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const unsigned = [];

  for (const file of files) {
    try {
      // defaultAuthPolicy => /pa, the Authenticode policy. Deliberately not /a: these
      // are embedded signatures, and catalog lookup would mask a missing one.
      await signtool.verify(file, { defaultAuthPolicy: true });
    } catch (e) {
      // A spawn failure (ENOENT, EACCES) means the verifier never ran. Reporting that
      // as "these files are unsigned" would be a lie, and a uniform one — it would fail
      // every file in the batch and point the investigation at the signing service.
      if (typeof e.code !== 'number') {
        throw new Error(`Could not run signtool to verify signatures: ${e.message}`);
      }
      unsigned.push({ file, reason: signtoolReason(e) });
    }
  }

  if (unsigned.length) {
    const detail = unsigned.map(({ file, reason }) => `${file}\n    ${reason}`).join('\n');
    throw new Error(
      `Signature verification failed for ${unsigned.length} of ${files.length} file(s):\n${detail}`,
    );
  }

  console.log(`Verified signatures on ${files.length} files.`);

  fs.unlinkSync(signingPath);
}

exports.default = async function afterSign(context) {
  if (process.platform === 'darwin') {
    await notarizeMac(context);
  }

  if (process.platform === 'win32') {
    await afterPackWin();
  }
};
