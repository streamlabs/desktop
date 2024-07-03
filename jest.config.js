const path = require('node:path');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'ts-jest',
  runner: '@kayahr/jest-electron-runner',
  modulePaths: [path.resolve(__dirname, 'app')],
  testEnvironment: '@kayahr/jest-electron-runner/environment',
  testEnvironmentOptions: {
    electron: {
      options: ['no-sandbox'],
    },
  },
  testMatch: ['**/app/**/*.test.ts'],
};
