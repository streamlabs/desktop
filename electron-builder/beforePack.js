const cp = require('child_process');
const fs = require('fs');
const path = require('path');

function signAndCheck(identity, filePath) {
  console.log(`Signing: ${filePath}`);

  cp.execSync(`codesign -fs "Developer ID Application: ${identity}" "${filePath}"`);

  // All files need to be writable for update to succeed on mac
  console.log(`Checking Writable: ${filePath}`);
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
  } catch {
    throw new Error(`File ${filePath} is not writable!`);
  }
}

function signBinaries(identity, directory) {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath = path.join(directory, file);

    if (fs.statSync(fullPath).isDirectory()) {
      signBinaries(identity, fullPath);
    } else {
      const absolutePath = path.resolve(fullPath);
      const ext = path.extname(absolutePath);

      // Don't follow symbolic links
      if (fs.lstatSync(absolutePath).isSymbolicLink()) continue;

      // Sign dynamic libraries
      if (ext === '.node') {
        signAndCheck(identity, absolutePath);
        continue;
      }
    }
  }
}

exports.default = async function(context) {
  if (process.platform !== 'darwin') return;
  if (process.env.SLOBS_NO_SIGN) return;

  console.log(JSON.stringify(context.packager.config));

  // Some *.node dynamic libraries do not go to the unpacked folder,
  // so we sign all *.node in the node_modules to be sure we can avoid
  // the com.apple.security.cs.disable-library-validation entitlement.
  signBinaries(
    context.packager.config.mac.identity,
    `${context.packager.projectDir}/node_modules`,
  );
};
