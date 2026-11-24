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

/**
 * The MCP server for AI agents ships as one bundled file next to the executable (see
 * app/util/mcp-launcher.js and win.extraFiles). Build it fresh for every package, so an
 * installer never carries a stale or missing server.
 */
function buildMcpBundle(projectDir) {
  const mcpDir = path.join(projectDir, 'mcp');
  const run = cmd => cp.execSync(cmd, { cwd: mcpDir, stdio: 'inherit' });
  if (!fs.existsSync(path.join(mcpDir, 'node_modules'))) run('npm install --no-audit --no-fund');
  try {
    run('npm run bundle');
  } catch (e) {
    // On a Windows-on-ARM machine packaging under emulated x64 Node, mcp/node_modules may only
    // have the ARM build of esbuild. The bundle itself is plain JS, the same on any machine.
    throw new Error(
      'Building the MCP bundle failed. If esbuild says it was installed for another platform, ' +
        'run in mcp/: npm install --no-save --force @esbuild/win32-x64@<its version>. ' +
        String(e),
    );
  }
  const out = path.join(mcpDir, 'bundle', 'streamlabs-mcp.cjs');
  if (!fs.existsSync(out)) throw new Error(`MCP bundle was not built: ${out}`);
  console.log(`MCP server bundled: ${out}`);
}

exports.default = async function(context) {
  buildMcpBundle(context.packager.projectDir);

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
