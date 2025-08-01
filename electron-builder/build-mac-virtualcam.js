const pjson = require('../package.json');
const cp = require('child_process');

function downloadTempRepo() {
  const repoVersion = pjson.macVirtualCamVersion;
  let result = true;
  const downloadRepoCmd = `git clone --branch ${repoVersion} --depth 1 https://github.com/streamlabs/slobs-virtual-cam-installer.git`;
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
      cp.execSync('cd ./slobs-virtual-cam-installer && ./build.sh');

      console.log('Copy the app into Frameworks folder');
      cp.execSync(
        `cp -R ./slobs-virtual-cam-installer/build/RelWithDebInfo/slobs-virtual-cam-installer.app \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Frameworks\"`,
      );
      console.log('Perform cleanup');
      cp.execSync('rm -rf slobs-virtual-cam-installer'); // Remove the repo. Not required for the build agent but helpful for local dev
      console.log('Completed setting up the slobs-virtual-cam-installer.app');
    } catch {
      console.error('Failed setup of slobs-virtual-cam-installer.');
    }
  } else {
    console.error('Could not download the mac-virtualcam repo');
  }
}

module.exports = buildVirtualCamExtension;
