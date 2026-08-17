const { notarize } = require('@electron/notarize');
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const os = require('os');

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
  const files = fs.readFileSync(signingPath, 'utf8').split('\n').filter(Boolean);
  const unsigned = files.filter(file => {
    try {
      cp.execSync(`signtool verify /pa /q "${file}"`, { stdio: 'ignore' });
      return false;
    } catch (e) {
      return true;
    }
  });

  if (unsigned.length) {
    throw new Error(
      `Signature verification failed for ${unsigned.length} of ${files.length} file(s):\n${unsigned.join('\n')}`,
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
