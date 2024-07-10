const { VueLoaderPlugin } = require('vue-loader');
const ESLintPlugin = require('eslint-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const DefinePlugin = require('webpack').DefinePlugin;
const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

const path = require('node:path');

const package = require('./package.json');

function getSentryMiniDumpURLFromDSN(dsn) {
  /*
    const sentryDsn = `https://${params.key}@${params.organization}.ingest.sentry.io/${params.project}`;
    const sentryMiniDumpURL = `https://${params.organization}.ingest.sentry.io/api/${params.project}/minidump/?sentry_key=${params.key}`;
*/

  const re = /https:\/\/([^@]+)@([^/]+)\/(.+)$/;
  const match = dsn.match(re);
  if (!match) return null;
  return `https://${match[2]}/api/${match[3]}/minidump/?sentry_key=${match[1]}`;
}

/** @type function ({production: boolean}, {mode?:string}): import('webpack').Configuration */
module.exports = function (env, argv) {
  const SENTRY_ORG = 'n-air-app2';
  const SENTRY_PROJECT = package.name === 'n-air-app' ? 'n-air-app' : 'n-air-app-unstable';
  const SentryDSNTable = {
    'n-air-app':
      'https://35a02d8ebec14fd3aadc9d95894fabcf@o4507508755791872.ingest.us.sentry.io/1246812',
    'n-air-app-unstable':
      'https://7451aaa71b7640a69ee1d31d6fd9ef78@o4507508755791872.ingest.us.sentry.io/1546758',
  };
  const DevDSN =
    'https://1cb5cdf6a93c466dad570861b8c82b61@o4507508755791872.ingest.us.sentry.io/1262580';
  const SENTRY_DSN = argv.mode === 'production' ? SentryDSNTable[SENTRY_PROJECT] : DevDSN;
  const SENTRY_MINIDUMP_URL = getSentryMiniDumpURLFromDSN(SENTRY_DSN);

  const definePlugin = new DefinePlugin({
    SENTRY_DSN: JSON.stringify(SENTRY_DSN),
    SENTRY_MINIDUMP_URL: JSON.stringify(SENTRY_MINIDUMP_URL),
  });

  const plugins = [];
  plugins.push(definePlugin);
  plugins.push(
    sentryWebpackPlugin({
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: {
        name: package.version,
      },
      // disable: true, // DEBUG
    }),
  );
  plugins.push(new VueLoaderPlugin());
  plugins.push(new ESLintPlugin({ extensions: ['js', 'ts'] }));

  /** @type import('webpack').Configuration */
  const common = {
    cache: {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
      },
    }, // if problem, clean node_modules/.cache
  };

  return [
    {
      ...common,
      output: {
        path: `${__dirname}/bundles`,
        filename: '[name].js',
        publicPath: '/bundles/',
        libraryTarget: 'commonjs2',
      },

      entry: {
        'sentry-defs': './sentry-defs.js',
      },
      plugins: [definePlugin],
      target: 'electron25-main',
    },
    {
      ...common,

      output: {
        path: `${__dirname}/bundles`,
        filename: '[name].js',
        publicPath: '/bundles/',
      },

      entry: {
        renderer: './app/app.ts',
        updater: './updater/ui.js',
      },

      devServer: {
        static: {
          directory: __dirname,
          publicPath: '/',
        },
        proxy: {
          '/account': {
            target: 'https://account.nicovideo.jp',
            changeOrigin: true,
            pathRewrite: { '^/account': '' },
          },
          '/oauth': {
            target: 'https://oauth.nicovideo.jp',
            changeOrigin: true,
            pathRewrite: { '^/oauth': '' },
          },
          '/blog': {
            target: 'https://blog.nicovideo.jp',
            changeOrigin: true,
            pathRewrite: { '^/blog': '' },
          },
        },
      },

      devtool: 'source-map',

      target: 'electron25-renderer',

      resolve: {
        extensions: ['.js', '.ts', '.tsx'],
        modules: [path.resolve(__dirname, 'app'), 'node_modules'],
      },

      // We want to dynamically require native addons
      externals: {
        'font-manager': 'require("font-manager")',

        // Not actually a native addons, but for one reason or another
        // we don't want them compiled in our webpack bundle.
        'aws-sdk': 'require("aws-sdk")',
        asar: 'require("asar")',
        'node-fontinfo': 'require("node-fontinfo")',
        'socket.io-client': 'require("socket.io-client")',
        rimraf: 'require("rimraf")',

        'utf-8-validate': 'require("utf-8-validate")',
        bufferutil: 'require("bufferutil")',
      },

      module: {
        rules: [
          {
            test: /\.vue$/,
            loader: 'vue-loader',
            options: {
              esModule: true,
              transformToRequire: {
                video: 'src',
                source: 'src',
              },
            },
          },
          {
            test: /\.ts$/,
            loader: 'ts-loader',
            exclude: /node_modules|vue\/src/,
          },
          {
            test: /\.tsx$/,
            exclude: /node_modules|vue\/src/,
            use: ['babel-loader', { loader: 'ts-loader' }],
          },
          {
            test: /\.js$/,
            loader: 'babel-loader',
            exclude: [/node_modules/, path.join(__dirname, 'bin')],
          },
          {
            test: /\.css$/,
            use: [
              'style-loader',
              {
                loader: 'css-loader',
                options: {
                  importLoaders: 1,
                },
              },
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions: {
                    plugins: [require('autoprefixer')({ grid: true })],
                  },
                },
              },
            ],
          },
          {
            test: /\.less$/,
            use: [
              'style-loader',
              {
                loader: 'css-loader',
                options: {
                  importLoaders: 1,
                },
              },
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions: {
                    plugins: [require('autoprefixer')({ grid: true })],
                  },
                },
              },
              'less-loader',
            ],
          },
          {
            test: /\.(png|jpe?g|gif|mp4|mp3|ico|wav|webm)(\?.*)?$/,
            loader: 'file-loader',
            options: {
              name: '[name]-[hash].[ext]',
              outputPath: 'media/',
              publicPath: 'bundles/media/',
            },
          },
          // Handles custom fonts. Currently used for icons.
          {
            test: /\.woff$/,
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'fonts/',
              publicPath: 'bundles/fonts/',
            },
          },
          {
            test: /\.svg$/,
            use: ['vue-svg-loader'],
          },
        ],
      },

      optimization: {
        splitChunks: {
          chunks: chunk => chunk.name === 'renderer',
          name: 'vendors~renderer',
        },
        chunkIds: 'named',
        minimizer: [new TerserPlugin({ sourceMap: true, terserOptions: { mangle: false } })],
      },

      plugins,

      stats: {
        warningsFilter: ["Can't resolve 'osx-temperature-sensor'"],
      },
    },
  ];
};
