const { notarize } = require('@electron/notarize');
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const os = require('os');

async function notarizeMac() {
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
    appPath,
    appBundleId: 'com.streamlabs.slobs',
    appleId: process.env['APPLE_ID'],
    appleIdPassword: process.env['APPLE_APP_PASSWORD'],
    ascProvider: process.env['APPLE_ASC_PROVIDER'],
    teamId: process.env['APPLE_TEAM_ID'],
  });

  console.log('Notarization finished.');
}

async function afterPackWin() {
  if (process.env.SLOBS_NO_SIGN) return;

  const signingPath = path.join(os.tmpdir(), 'sldesktopsigning');

  if (fs.existsSync(signingPath)) {
    cp.execSync(`logisign client --client logitech-cpg-sign-client --app streamlabs --filelist ${signingPath}`, { stdio: 'inherit' });
    fs.unlinkSync(signingPath);
  } else {
    throw new Error('EXPECTED TO SIGN BINARIES BUT SIGNING MANIFEST IS MISSING');
  }
}

exports.default = async function afterSign(context) {
  if (process.platform === 'darwin') {
    await notarizeMac();
  }

  if (process.platform === 'win32') {
    await afterPackWin();
  }
};
