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
    // The `electron` npm package is a devDependency, but two production deps
    // (@electron/remote, react-devtools-electron) peer-depend on it, so it lands in
    // the production tree. Its dist/ is a full second copy of the Electron runtime
    // (~348MB) that smart-unpack then extracts into app.asar.unpacked. Nothing needs
    // it: index.js only resolves the binary path for development, and in a packaged
    // app require('electron') resolves to the built-in module.
    '!node_modules/electron',
    'vendor',
    'app/i18n',
    'app/util/shutdown-coordinator.js',
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
  // Turn "nothing was configured to sign" into a hard error rather than a silently
  // unsigned build. Must be gated on SLOBS_NO_SIGN: on macOS an unsigned build sets
  // mac.identity to null, which throws when forceCodeSigning is on.
  forceCodeSigning: !process.env.SLOBS_NO_SIGN,
  // Don't let electron-builder rebuild native modules at package time. electron-builder
  // 24+ delegates this to @electron/rebuild, which is more aggressive than the app-builder
  // Go rebuilder it replaced, and there is nothing here for it to usefully do:
  //   - every native module we ship is N-API, so it is ABI-stable across the Node 20 -> 24
  //     jump and needs no rebuild for Electron 43;
  //   - the Streamlabs-owned modules (obs-studio-node, crash-handler, font-manager,
  //     node-libuiohook, node-fontinfo, game_overlay, color-picker) arrive as prebuilt
  //     tarballs with no binding.gyp and cannot be built on a release machine anyway;
  //   - realm's binding.gyp is an empty `{}` stub that only exists to signal "prebuilt" to
  //     old electron-builder; its own install script already ran `prebuild-install`;
  //   - deasync is only used by the e2e harness (test/helpers/api-client.ts), which runs in
  //     plain Node, so building it against Electron is actively wrong.
  // Left on, @electron/rebuild source-builds deasync and dies resolving node-addon-api's
  // include dir ("Cannot open include file: 'napi.h'") on the release machine.
  npmRebuild: false,
  nsis: {
    license: 'AGREEMENT',
    oneClick: false,
    warningsAsErrors: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    include: 'installer.nsh',
    // Replaces the old scripts/postinstall.js patch of app-builder-lib's
    // assistedInstaller.nsh. Requires electron-builder >= 23.0.6.
    removeDefaultUninstallWelcomePage: true,
  },
  asarUnpack : ["**/node-libuiohook/**", "**/node-fontinfo/**", "**/font-manager/**", "**/game_overlay/**","**/color-picker/**"],
  publish: {
    provider: 'generic',
    url: 'https://slobs-cdn.streamlabs.com',
  },
  win: {
    executableName: 'Streamlabs OBS',
    extraFiles: ['LICENSE', 'AGREEMENT', 'LICENSES', 'shared-resources/**/*', '!shared-resources/README'],
    // Replaces `signDlls: true`, removed in electron-builder 26. Both select the
    // same files: `.dll` matches this list, and `.exe` still signs via the
    // isExe fallback in WinPackager.shouldSignFile.
    signExts: ['.dll'],
    signtoolOptions: {
      // These currently match electron-builder's defaults, but are set explicitly
      // so a change to those defaults can't silently alter our timestamping.
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      timeStampServer: 'http://timestamp.digicert.com',
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
  },
  mac: {
    identity: process.env.SLOBS_NO_SIGN
      ? null
      : process.env.APPLE_SLD_IDENTITY || 'Streamlabs LLC (UT675MBB9Q)',
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
