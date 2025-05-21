const pjson = require('../package.json');
const cp = require('child_process');

function downloadTempRepo() {
  const repoVersion = pjson.macVirtualCamVersion;
  let result = true;
  const repo = `git clone --branch ${repoVersion} --depth 1 https://github.com/streamlabs/obs-studio.git`;
  try {
    cp.execSync(
      'rm -rf obs-studio',
    );
    cp.execSync(repo);
  } catch {
    result = false;
  }
  return result;
}

// Download the Mac virtual camera system extension. Build, codesign, and pack it into the executable.
function buildVirtualCamExtension(context) {
  const hasDownloadedRepo = downloadTempRepo(cp);
  if (hasDownloadedRepo) {
    const hasBuiltProj = cp.execSync(`cd ./obs-studio/plugins/mac-virtualcam/src/camera-extension && ./build-slobs-cameraextension.sh`);
    if (hasBuiltProj) {
      cp.execSync(
        `mkdir -p \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Library/SystemExtensions\"`,
      );
      // Now copy the system extension into the dist app
      cp.execSync(
        `cp -R ./obs-studio/plugins/mac-virtualcam/src/camera-extension/build_macos/RelWithDebInfo/com.streamlabs.slobs.mac-camera-extension.systemextension \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Library/SystemExtensions\"`,
      );
    }
  } else {
    console.log('Could not download the vcam repo');
  }
}

module.exports = buildVirtualCamExtension;
