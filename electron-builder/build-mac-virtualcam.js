const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const pjson = require('../package.json');
const stream = require('stream');

function signApps(context) {
  // For apps that requires specific entitlements. Ensures the entitlements file is provided during signing
  const installer_entitlements = '--entitlements electron-builder/installer-entitlements.plist';
  const extension_entitlements = '--entitlements electron-builder/extension-entitlements.plist';
  const installerPath = `${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Frameworks/slobs-virtual-cam-installer.app`;
  const extensionPath = `${installerPath}/Contents/Library/SystemExtensions/com.streamlabs.slobs.mac-camera-extension.systemextension`;
  const executables = [extensionPath, installerPath];
  for (const exe of executables) {
    const use_entitlement = exe === installerPath ? installer_entitlements : extension_entitlements;
    console.log(`using entitlement ${use_entitlement}`);
    cp.execSync(
      `codesign --sign "Developer ID Application: ${context.packager.config.mac.identity}" ${use_entitlement} -o runtime --timestamp --force --verbose "${exe}"`,
    );

    // All files need to be writable for update to succeed on mac
    console.log(`Checking Writable: ${exe}`);
    try {
      fs.accessSync(exe, fs.constants.W_OK);
    } catch {
      throw new Error(`File ${exe} is not writable!`);
    }
  }
}

// Download the Mac virtual camera system extension and pack it into the executable.
async function downloadVirtualCamExtension(context) {
  console.log("Download mac virtual camera");
  const destFile = 'slobs-virtual-cam-installer.tar.gz';

  let arch = os.arch();
  if (process.env.ARCH) {
    arch = process.env.ARCH; // get the architecture from github runner.
    console.log(`use process.env.ARCH ${arch} for virtual camera system extension`);
  } else {
    console.log(`use os.arch ${arch} for virtual camera system extension`);
  }
  if (arch === 'x64') {
    arch = 'x86_64';
  }
  const sourceUrl = pjson.macVirtualCamUrl.replace('[ARCH]', arch);

  await downloadFile(sourceUrl, destFile);
  console.log('Extracting tar file');
  cp.execSync(`tar -xzvf ${destFile}`);
  cp.execSync('rm -rf ./slobs-virtual-cam-installer.app/Contents/embedded.provisionprofile'); // remove the developer profile

  console.log('Copying slobs-virtual-cam-installer.app into Frameworks folder');
  cp.execSync(
    `cp -R ./slobs-virtual-cam-installer.app \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Frameworks\"`,
  );

  cp.execSync('rm -rf ./slobs-virtual-cam-installer.*');
}

function downloadFile(srcUrl, dstPath) {
  return new Promise((resolve, reject) => {
    fetch(srcUrl)
      .then(response => {
        if (response.ok) return response;
        console.error(`Got ${response.status} response from ${srcUrl}`);
        return Promise.reject(response);
      })
      .then(({ body }) => {
        const fileStream = fs.createWriteStream(dstPath);
        stream.pipeline(body, fileStream, e => {
          if (e) {
            console.error(`Error downloading ${srcUrl}`, e);
            reject(e);
          } else {
            console.log(`Successfully downloaded ${srcUrl}`);
          }
          resolve();
        });
      })
      .catch(e => reject(e));
  });
}

module.exports = { downloadVirtualCamExtension, signApps };
