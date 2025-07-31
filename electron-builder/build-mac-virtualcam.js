const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const pjson = require('../package.json');
const stream = require('stream');

// Download the Mac virtual camera system extension and pack it into the executable.
async function buildVirtualCamExtension(context) {
  console.log("Download mac virtual camera");
  const destFile = 'slobs-virtual-cam-installer.tar.gz';

  let arch = os.arch();
  if (arch === 'x64') {
    arch = 'x86_64';
  }
  const sourceUrl = pjson.macVirtualCamUrl.replace('[ARCH]', arch);

  await downloadFile(sourceUrl, destFile);
  console.log('Extracting tar file');
  cp.execSync(
    `tar -xzvf ${destFile}`,
  );
  console.log('Copying slobs-virtual-cam-installer.app into Frameworks folder');
  cp.execSync(
    `cp -R ./slobs-virtual-cam-installer.app \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Frameworks\"`,
  );
  cp.execSync(
    `rm -rf ./slobs-virtual-cam-installer.*`,
  );
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

module.exports = buildVirtualCamExtension;
