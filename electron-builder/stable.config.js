// @ts-check

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'jp.nicovideo.nair',
  productName: 'N Air',
  icon: 'media/images/icon.ico',
  files: [
    'bundles',
    'node_modules',
    'vendor',
    'app/i18n',
    'updater/index.html',
    'updater/Updater.js',
    'index.html',
    'main.js',
    'obs-api',
  ],
  extraFiles: ['scene-presets', 'nvoice', 'LICENSE', 'AGREEMENT.sjis'],
  detectUpdateChannel: false,
  publish: {
    provider: 'generic',
    useMultipleRangeRequest: false,
    channel: 'latest',
    url: 'https://n-air-app.nicovideo.jp/download/windows',
  },
  nsis: {
    license: 'AGREEMENT.sjis',
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    // eslint-disable-next-line no-template-curly-in-string
    artifactName: 'n-air-app-setup.${version}.${ext}',
    include: 'installer.nsh',
    warningsAsErrors: false,
  },
  win: {
    publisherName: ['DWANGO Co.,Ltd.'],
    rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    timeStampServer: 'http://timestamp.digicert.com',
  },
  extraMetadata: {
    env: 'production',
  },
};

if (process.env.CERTIFICATE_SUBJECT_NAME) {
  // @ts-ignore winがnullableなのと、certificateSubjectNameが型宣言上ではpropertyで書き込めないというエラーになるのを回避
  config.win.certificateSubjectName = process.env.CERTIFICATE_SUBJECT_NAME;
}

module.exports = config;
