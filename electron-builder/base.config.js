const signtool = require('signtool');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const base = {
  appId: 'com.streamlabs.slobs',
  productName: 'Streamlabs Desktop',
  icon: 'media/images/icon.ico',
  files: [
    'bundles',
    '!bundles/*.js.map',
    'node_modules',
    'vendor',
    'app/i18n',
    'media/images/game-capture',
    'updater/build/bootstrap.js',
    'updater/build/bundle-updater.js',
    'updater/index.html',
    'index.html',
    'main.js',
    'obs-api',
    'updater/mac/index.html',
    'updater/mac/Updater.js',
  ],
  directories: {
    buildResources: '.',
  },
  nsis: {
    license: 'AGREEMENT',
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    include: 'installer.nsh',
  },
  asarUnpack : ["**/node-libuiohook/**", "**/node-fontinfo/**", "**/font-manager/**", "**/game_overlay/**","**/color-picker/**"],
  publish: {
    provider: 'generic',
    url: 'https://slobs-cdn.streamlabs.com',
  },
  win: {
    executableName: 'Streamlabs OBS',
    extraFiles: ['LICENSE', 'AGREEMENT', 'shared-resources/**/*', '!shared-resources/README'],
    rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    timeStampServer: 'http://timestamp.digicert.com',
    signDlls: true,
    signingHashAlgorithms: ['sha256'],
    async sign(config) {
      if (process.env.SLOBS_NO_SIGN) return;

      if (
        config.path.indexOf('node_modules\\obs-studio-node\\data\\obs-plugins\\win-capture') !== -1
      ) {
        console.log(`Skipping ${config.path}`);
        return;
      }

      console.log(`Signing ${config.hash} ${config.path}`);

      const signingPath = path.join(os.tmpdir(), 'sldesktopsigning');

      if (fs.existsSync(signingPath)) {
        fs.appendFileSync(signingPath, `${config.path}\n`);
      } else {
        cp.execSync(`logisign client --client logitech-cpg-sign-client --app streamlabs --files "${config.path}"`, { stdio: 'inherit' });
      }
    },
  },
  mac: {
    identity: (process.env.APPLE_SLD_IDENTITY) ? process.env.APPLE_SLD_IDENTITY : 'Streamlabs LLC (UT675MBB9Q)',
    extraFiles: [
      'shared-resources/**/*',
      '!shared-resources/README',
      // {
      //   "from": "node_modulesdwadawd/obs-studio-node/Frameworks/*",
      //   "to": "Frameworks/",
      //   "filter": ["**/*"]
      // },
      // {
      //   "from": "node_modules/obs-studio-node/Frameworks/*",
      //   "to": "Resources/app.asar.unpacked/node_modules/",
      //   "filter": ["**/*"]
      // }
    ],
    icon: 'media/images/icon-mac.icns',
    hardenedRuntime: true,
    entitlements: 'electron-builder/entitlements.plist',
    entitlementsInherit: 'electron-builder/entitlements.plist',
    extendInfo: {
      NSAppleEventsUsageDescription: 'Allow Streamlabs Desktop to run Apple scripts.',
      NSAppleScriptEnabled: 'YES',
      CFBundleURLTypes: [
        {
          CFBundleURLName: 'Streamlabs OBS Link',
          CFBundleURLSchemes: ['slobs'],
        },
      ],
    },
  },
  dmg: {
    background: 'media/images/dmg-bg.png',
    iconSize: 85,
    contents: [
      {
        x: 130,
        y: 208,
      },
      {
        type: 'link',
        path: '/Applications',
        x: 380,
        y: 208,
      },
    ],
  },
  extraMetadata: {
    env: 'production',
    sentryFrontendDSN: process.env.SLD_SENTRY_FRONTEND_DSN,
    sentryBackendClientURL: process.env.SLD_SENTRY_BACKEND_CLIENT_URL,
    sentryBackendClientPreviewURL: process.env.SLD_SENTRY_BACKEND_CLIENT_PREVIEW_URL,
  },
  beforePack: './electron-builder/beforePack.js',
  afterPack: './electron-builder/afterPack.js',
  afterSign: './electron-builder/afterSign.js',
};

module.exports = base;
