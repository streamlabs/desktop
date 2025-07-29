function findDarwinArchitecture() {
  let arch = '';
  if (process.env.npm_config_arch == 'arm64') {
    arch = '-arm64';
  } else if (process.env.npm_config_arch == 'x64') {
    arch = '-x86_64';
  } else if (process.arch == 'arm64') {
    arch = '-arm64';
  } else if (process.arch == 'x64') {
    arch = '-x86_64';
  } else {
    throw 'CPU architecture not supported.';
  }
  return arch;
}

module.exports = findDarwinArchitecture;
