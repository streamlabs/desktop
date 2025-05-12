/*global SLOBS_BUNDLE_ID*/
/*global SLD_SENTRY_BACKEND_SERVER_URL, SLD_SENTRY_FRONTEND_DSN, SLD_SENTRY_BACKEND_SERVER_PREVIEW_URL*/

import { I18nService, $t } from 'services/i18n';

// eslint-disable-next-line
window['eval'] = global.eval = () => {
  throw new Error('window.eval() is disabled for security');
};

import Vue from 'vue';

import { createStore } from './store';
import { WindowsService } from './services/windows';
import { ObsUserPluginsService } from 'services/obs-user-plugins';
import { AppService } from './services/app';
import Utils from './services/utils';
import electron from 'electron';
import * as Sentry from '@sentry/browser';
import * as Integrations from '@sentry/integrations';
import VTooltip from 'v-tooltip';
import Toasted from 'vue-toasted';
import VueI18n from 'vue-i18n';
import VModal from 'vue-js-modal';
import VeeValidate from 'vee-validate';
import ChildWindow from 'components/windows/ChildWindow';
import OneOffWindow from 'components/windows/OneOffWindow.vue';
import { UserService, setSentryContext } from 'services/user';
import { getResource } from 'services';
import * as obs from '../obs-api';
import path from 'path';
import util from 'util';
import { Loader, Blank } from 'components/shared/ReactComponentList';
import Main from 'components/windows/Main';
import process from 'process';
import { MetricsService } from 'services/metrics';
import { UsageStatisticsService } from 'services/usage-statistics';
import * as remote from '@electron/remote';
import { RealmService } from 'app-services';

// // TODO: commented until we remove slap library
// // For React Windows
// import React from 'react';
// import ReactDOM from 'react-dom';
// import Main from 'components-react/windows/Main';

const { ipcRenderer } = electron;
const slobsVersion = Utils.env.SLOBS_VERSION;
const isProduction = Utils.env.NODE_ENV === 'production';
const isPreview = !!Utils.env.SLOBS_PREVIEW;

if (isProduction) {
  electron.crashReporter.addExtraParameter('windowId', Utils.getWindowId());
}

let usingSentry = false;
const windowId = Utils.getWindowId();

// TODO: Remove after 1.6.0
const styleSheets = document.styleSheets;

for (let i = 0; i < styleSheets.length; i++) {
  const sheet = styleSheets[i];
  if (sheet.href?.match(/foundation\.min\.css/)) {
    sheet.disabled = true;
    break;
  }
}

function wrapLogFn(fn: string) {
  const old: Function = console[fn];
  console[fn] = (...args: any[]) => {
    old.apply(console, args);

    const level = fn === 'log' ? 'info' : fn;

    sendLogMsg(level, ...args);
  };
}

function sendLogMsg(level: string, ...args: any[]) {
  const serialized = args
    .map(arg => {
      if (typeof arg === 'string') return arg;

      return util.inspect(arg);
    })
    .join(' ');

  ipcRenderer.send('logmsg', { level, sender: windowId, message: serialized });
}

['log', 'info', 'warn', 'error'].forEach(wrapLogFn);

if (windowId === 'worker') {
  console.log(`Bundle Id: ${SLOBS_BUNDLE_ID}`);
}

window.addEventListener('error', e => {
  sendLogMsg('error', e.message, e.error);
});

window.addEventListener('unhandledrejection', e => {
  sendLogMsg('error', e.reason);
});

// Remove the startup event listener that catches bundle parse errors and other
// critical issues starting up the renderer.
if (window['_startupErrorHandler']) {
  window.removeEventListener('error', window['_startupErrorHandler']);
  delete window['_startupErrorHandler'];
}

// Used by Eddy for debugging on mac.
if (!isProduction) {
  const windowId = Utils.getWindowId();
  process.title = `SLOBS Renderer ${windowId}`;
  console.log(`${windowId} - PID: ${process.pid}`);
}

if (isProduction || process.env.SLOBS_REPORT_TO_SENTRY) {
  const sampleRate = isPreview || process.env.SLOBS_REPORT_TO_SENTRY ? 1.0 : 0.1;
  const isSampled = Math.random() < sampleRate;

  usingSentry = true;

  // Get actual filenames we are using from the bundle updater,
  // so we can ensure accurate stack traces on sentry. The mechanism
  // by which the bundle updater works hides the true source names
  // from us.
  const bundles = ['renderer.js', 'vendors~renderer.js'];
  const bundleNames = electron.ipcRenderer.sendSync('getBundleNames', bundles);

  Sentry.init({
    dsn: SLD_SENTRY_FRONTEND_DSN,
    release: `${slobsVersion}-${SLOBS_BUNDLE_ID}`,
    beforeSend: (event, hint) => {
      // Because our URLs are local files and not publicly
      // accessible URLs, we simply truncate and send only
      // the filename.  Unfortunately sentry's electron support
      // isn't that great, so we do this hack.
      // Some discussion here: https://github.com/getsentry/sentry/issues/2708
      const normalize = (filename: string) => {
        const splitArray = filename.split('/');
        const fileName = splitArray[splitArray.length - 1];

        if (bundles.includes(fileName)) {
          return bundleNames[fileName];
        }

        return fileName;
      };

      if (hint.originalException) {
        sendLogMsg('error', hint.originalException);
      }

      if (event.exception && event.exception.values[0].stacktrace) {
        event.exception.values[0].stacktrace.frames.forEach(frame => {
          frame.filename = normalize(frame.filename);
        });
      }

      if (event.request) {
        event.request.url = normalize(event.request.url);
      }

      return isSampled || event.tags?.feature === 'highlighter' ? event : null;
    },
    integrations: [new Integrations.Vue({ Vue })],
  });

  const oldConsoleError = console.error;

  console.error = (msg: unknown, ...params: any[]) => {
    oldConsoleError(msg, ...params);

    Sentry.withScope(scope => {
      if (params[0] instanceof Error) {
        scope.setExtra('exception', params[0].stack);
      }

      scope.setExtra('console-args', JSON.stringify(params, null, 2));

      if (typeof msg === 'string') {
        Sentry.captureMessage(msg, Sentry.Severity.Error);
      } else if (msg instanceof Error) {
        Sentry.captureException(msg);
      } else {
        Sentry.captureMessage(
          'console.error was called with other type than string or Error',
          Sentry.Severity.Error,
        );
      }
    });
  };
}

require('./app.g.less');
require('./themes.g.less');

// Initiates tooltips and sets their parent wrapper
Vue.use(VTooltip);
VTooltip.options.defaultContainer = '#mainWrapper';
Vue.use(Toasted);
Vue.use(VeeValidate); // form validations
Vue.use(VModal);

Vue.directive('trackClick', {
  bind(el: HTMLElement, binding: { value?: { component: string; target: string } }) {
    if (typeof binding.value.component !== 'string') {
      throw new Error(
        `vTrackClick requires "component" to be passed. Got: ${binding.value.component}`,
      );
    }

    if (typeof binding.value.target !== 'string') {
      throw new Error(`vTrackClick requires "target" to be passed. Got: ${binding.value.target}`);
    }

    el.addEventListener('click', () => {
      getResource<UsageStatisticsService>('UsageStatisticsService').actions.recordClick(
        binding.value.component,
        binding.value.target,
      );
    });
  },
});

// Disable chrome default drag/drop behavior
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('dragenter', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());

const ctxMenu = remote.Menu.buildFromTemplate([
  { role: 'copy', accelerator: 'CommandOrControl+C' },
  { role: 'paste', accelerator: 'CommandOrControl+V' },
]);

document.addEventListener('contextmenu', () => {
  ctxMenu.popup();
});

export const apiInitErrorResultToMessage = (resultCode: obs.EVideoCodes) => {
  switch (resultCode) {
    case obs.EVideoCodes.NotSupported: {
      return 'Failed to initialize Streamlabs Desktop. Your video drivers may be out of date, or Streamlabs Desktop may not be supported on your system.';
    }
    case obs.EVideoCodes.ModuleNotFound: {
      return 'DirectX could not be found on your system. Please install the latest version of DirectX for your machine here <https://www.microsoft.com/en-us/download/details.aspx?id=35?> and try again.';
    }
    default: {
      return 'An unknown error was encountered while initializing Streamlabs Desktop.';
    }
  }
};

const showDialog = (message: string): void => {
  remote.dialog.showErrorBox('Initialization Error', message);
};

document.addEventListener('DOMContentLoaded', async () => {
  await RealmService.instance.connect();

  const store = createStore();

  // setup VueI18n plugin
  Vue.use(VueI18n);

  const i18n = new VueI18n({
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: {},
    silentTranslationWarn: false,
    missing: (language: string, key: string) => {
      if (isProduction) return;
      console.error(`Missing translation found for ${language} -- "${key}"`);
    },
  });
  I18nService.setVuei18nInstance(i18n);

  // We don't register main/child windows in dev mode to allow refreshing
  if (!Utils.isOneOffWindow() && !Utils.isDevMode()) {
    ipcRenderer.send('register-in-crash-handler', { pid: process.pid, critical: false });
  }

  // The worker window can safely access services immediately
  if (Utils.isWorkerWindow()) {
    const windowsService: WindowsService = WindowsService.instance;

    // Services
    const appService: AppService = AppService.instance;
    const obsUserPluginsService: ObsUserPluginsService = ObsUserPluginsService.instance;

    // This is used for debugging
    window['obs'] = obs;

    // Host a new OBS server instance
    obs.IPC.host(remote.process.env.IPC_UUID);
    obs.NodeObs.SetWorkingDirectory(
      path.join(
        remote.app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
        'node_modules',
        'obs-studio-node',
      ),
    );

    await obsUserPluginsService.initialize();

    // Initialize OBS API
    const apiResult = obs.NodeObs.OBS_API_initAPI(
      'en-US',
      appService.appDataDirectory,
      remote.process.env.SLOBS_VERSION,
      isPreview ? SLD_SENTRY_BACKEND_SERVER_PREVIEW_URL : SLD_SENTRY_BACKEND_SERVER_URL,
    );

    if (apiResult !== obs.EVideoCodes.Success) {
      const message = apiInitErrorResultToMessage(apiResult);
      showDialog(message);

      ipcRenderer.send('unregister-in-crash-handler', { pid: process.pid });

      obs.NodeObs.InitShutdownSequence();
      obs.IPC.disconnect();

      electron.ipcRenderer.send('shutdownComplete');
      return;
    }

    ipcRenderer.on('closeWindow', () => windowsService.closeMainWindow());
    I18nService.instance.load();
    AppService.instance.load();
  }

  if (Utils.isChildWindow()) {
    ipcRenderer.on('closeWindow', () => {
      const windowsService: WindowsService = WindowsService.instance;
      windowsService.closeChildWindow();
    });
  }

  const windowId = Utils.getCurrentUrlParams().windowId;

  // // TODO: commented until we remove slap library
  // if (windowId !== 'main') {
  // create a root Vue component
  const vm = new Vue({
    i18n,
    store,
    el: '#app',
    data: { isRefreshing: false },
    methods: {
      // refresh current window
      startWindowRefresh() {
        // set isRefreshing to true to unmount all components and destroy Displays
        this.isRefreshing = true;

        // unregister current window from the crash handler
        ipcRenderer.send('unregister-in-crash-handler', { pid: process.pid });

        // give the window some time to finish unmounting before reload
        Utils.sleep(100).then(() => {
          window.location.reload();
        });
      },
    },
    render(h) {
      if (this.isRefreshing) return h(Blank);
      if (windowId === 'worker') return h(Blank);
      if (windowId === 'main') return h(Main);
      if (windowId === 'child') {
        if (store.state.bulkLoadFinished && store.state.i18nReady) {
          return h(ChildWindow);
        }

        return h(Loader);
      }
      return h(OneOffWindow);
    },
  });

  // allow to refresh the window by pressing `F5` in the DevMode
  if (Utils.isDevMode()) {
    window.addEventListener('keyup', ev => {
      if (ev.key === 'F5') vm.startWindowRefresh();
    });
  }
  // // TODO: commented until we remove slap library
  // } else {
  //   // create a roote React component
  //   ReactDOM.render(React.createElement(Main), document.getElementById('app'));
  // }

  let mainWindowShowTime = 0;
  if (Utils.isMainWindow()) {
    remote.getCurrentWindow().show();
    mainWindowShowTime = Date.now();
  }

  // Perform some final initialization now that services are ready
  ipcRenderer.on('initFinished', () => {
    // setup translations for the current window
    if (!Utils.isWorkerWindow()) {
      I18nService.uploadTranslationsToVueI18n(true).then(() => {
        store.commit('I18N_READY');
      });
    }

    if (Utils.isMainWindow()) {
      const metricsService: MetricsService = MetricsService.instance;
      metricsService.actions.recordMetric('mainWindowShowTime', mainWindowShowTime);
    }

    if (usingSentry) {
      const userService = getResource<UserService>('UserService');
      const ctx = userService.getSentryContext();
      if (ctx) setSentryContext(ctx);
      userService.sentryContext.subscribe(setSentryContext);
    }
  });
});

if (Utils.isDevMode()) {
  window.addEventListener('error', () => ipcRenderer.send('showErrorAlert'));
  window.addEventListener('keyup', ev => {
    if (ev.key === 'F12') electron.ipcRenderer.send('openDevTools');
  });
}
