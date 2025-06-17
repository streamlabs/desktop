const pjson = require('../package.json');
const cp = require('child_process');

function downloadTempRepo() {
  const repoVersion = pjson.macVirtualCamVersion;
  let result = true;
  const downloadRepoCmd = `git clone --branch ${repoVersion} --depth 1 https://github.com/streamlabs/obs-studio.git`;
  try {
    cp.execSync(downloadRepoCmd);
  } catch {
    result = false;
  }
  return result;
}

// Download the Mac virtual camera system extension. Build, codesign, and pack it into the executable.
function buildVirtualCamExtension(context) {
  const hasDownloadedRepo = downloadTempRepo(cp);
  if (hasDownloadedRepo) {
    try {
      console.log('Build the camera system extension');
      cp.execSync('cd ./obs-studio/plugins/mac-virtualcam/src/camera-extension && ./build-slobs-cameraextension.sh');

      console.log('Create Contents/Library/SystemExtensions');
      cp.execSync(
        `mkdir -p \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Library/SystemExtensions\"`,
      );
      console.log('Copy system extension into the final app');
      cp.execSync(
        `cp -R ./obs-studio/plugins/mac-virtualcam/src/camera-extension/build_macos/RelWithDebInfo/com.streamlabs.slobs.mac-camera-extension.systemextension \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Library/SystemExtensions\"`,
      );
      console.log('Perform cleanup');
      cp.execSync('rm -rf obs-studio'); // Remove the repo
    } catch {
      console.error('Failed to copy the system extension into the app.');
    }
  } else {
    console.error('Could not download the mac-virtualcam repo');
  }
}

module.exports = buildVirtualCamExtension;
