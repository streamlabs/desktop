import test from 'ava';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';
import { Subject } from 'rxjs';
import { VCamOutputType } from 'obs-studio-node';
import type { VirtualWebcamService } from '../../app/services/virtual-webcam';

const Vue = require('vue');
const Vuex = require('vuex');
Vue.use(Vuex);

const storageKey = 'PersistentStatefulService-VirtualWebcamService';
type Storage = Map<string, string>;
type NativeCall = ['update', number, string] | ['start'] | ['stop'];

/**
 * Run the compiled service, Vuex mutations and persistence implementation in a
 * fresh module context for each application lifetime. Only host dependencies
 * (Electron, IPC, installation and browser storage) are replaced. No OSN binary
 * or camera driver is loaded, so these regressions also run without a webcam.
 */
function boot(storage: Storage, installed = true) {
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  function load<T = any>(file: string, imports: Record<string, unknown>): T {
    const filename = resolve(__dirname, '../../app', `${file}.js`);
    const exports = {};
    runInNewContext(
      readFileSync(filename, 'utf8'),
      {
        exports,
        localStorage,
        console,
        require(name: string) {
          if (!(name in imports)) throw new Error(`Unexpected dependency: ${name} in ${file}`);
          return imports[name];
        },
      },
      { filename },
    );
    return exports as T;
  }

  const utils = load('services/utils', {
    urijs: { default: require('urijs') },
    'lodash/isEqual': { default: require('lodash/isEqual') },
    'lodash/cloneDeep': { default: require('lodash/cloneDeep') },
    electron: { default: {} },
    fs: { default: require('fs') },
    path: { default: require('path') },
    '@electron/remote': { process: { env: { NODE_ENV: 'production' } } },
  });
  const serviceCore = load('services/core/service', { rxjs: { Subject } });
  const stateful = load('services/core/stateful-service', {
    vue: { default: Vue },
    './service': serviceCore,
    'services/utils': utils,
  });
  const persistent = load('services/core/persistent-stateful-service', {
    './stateful-service': stateful,
    '../utils': utils,
    'lodash/merge': { default: require('lodash/merge') },
    'lodash/cloneDeep': { default: require('lodash/cloneDeep') },
  });
  const calls: NativeCall[] = [];
  const errors: string[] = [];
  const shutdownStarted = new Subject<void>();
  let uninstallResult = 0;
  const api = {
    OBS_service_isVirtualCamPluginInstalled: () => (installed ? 1 : 0),
    OBS_service_updateVirtualCam: (type: number, name: string) =>
      calls.push(['update', type, name]),
    OBS_service_startVirtualCam: () => calls.push(['start']),
    OBS_service_stopVirtualCam: () => calls.push(['stop']),
    OBS_service_uninstallVirtualCamPlugin: () => uninstallResult,
  };
  const dependencies: Record<string, unknown> = {
    appService: { shutdownStarted },
    usageStatisticsService: { recordFeatureUsage() {} },
  };
  const { VirtualWebcamService: Service } = load<{
    VirtualWebcamService: typeof VirtualWebcamService;
  }>('services/virtual-webcam', {
    'services/core': {
      ...serviceCore,
      ...stateful,
      ...persistent,
      ExecuteInWorkerProcess: () => (_target: unknown, _name: string, descriptor: unknown) =>
        descriptor,
    },
    '../../obs-api': { NodeObs: api, EVcamInstalledStatus: { Installed: 1, LegacyInstalled: 2 } },
    path: { default: require('path') },
    os: { default: require('os') },
    'util/requests': {},
    'util/operating-systems': {
      OS: { Windows: 'win32', Mac: 'darwin' },
      byOS: (handlers: Record<string, () => void>) => handlers.win32(),
    },
    'services/core/injector': {
      Inject: () => (target: object, key: string) => {
        Object.defineProperty(target, key, { get: () => dependencies[key] });
      },
    },
    'services/settings': {},
    'app-services': {},
    '@electron/remote': {
      dialog: { showErrorBox: (_title: string, message: string) => errors.push(message) },
    },
    rxjs: { Subject },
    './core/signals': {},
    './signals-manager': {},
    'services/i18n': { $t: (message: string) => message },
    'services/video-output-coordinator': load('services/video-output-coordinator', {}),
  });
  const store = new Vuex.Store({ modules: { VirtualWebcamService: stateful.getModule(Service) } });
  stateful.StatefulService.setupVuexStore(store);
  const service = Service.instance as VirtualWebcamService;
  return { service, calls, errors, shutdownStarted, failUninstall: () => (uninstallResult = 1) };
}

function saved(storage: Storage) {
  return JSON.parse(storage.get(storageKey) || '{}');
}

test('Virtual webcam starts with Program on a fresh cache without configuring or starting OSN', t => {
  const { service, calls } = boot(new Map());
  t.is(service.state.outputType, VCamOutputType.ProgramView);
  t.is(service.state.outputSelection, '');
  t.false(service.state.running);
  t.deepEqual(calls, []);
});

for (const [label, type] of [
  ['Scene', VCamOutputType.SceneOutput],
  ['Source', VCamOutputType.SourceOutput],
] as const) {
  test(`Virtual webcam saves and restores ${label} and its selected target before starting OSN`, async t => {
    const storage: Storage = new Map();
    const first = boot(storage);
    first.service.update(type, 'chosen-target');
    await Vue.nextTick();
    t.deepEqual(saved(storage), { outputType: type, outputSelection: 'chosen-target' });
    first.shutdownStarted.next();

    const second = boot(storage);
    t.is(second.service.state.outputType, type);
    t.is(second.service.views.outputType, type.toString());
    t.is(second.service.views.outputSelection, 'chosen-target');
    t.deepEqual(second.calls, [], 'restoration does not resolve targets before scenes are loaded');

    second.service.start();
    t.deepEqual(second.calls, [['update', type, 'chosen-target'], ['start']]);
    t.deepEqual(second.errors, []);
    second.service.stop();
    await Vue.nextTick();
  });

  test(`Virtual webcam keeps repeated ${label} selections in sync and restores the latest target`, async t => {
    const storage: Storage = new Map();
    const first = boot(storage);
    first.service.update(type, 'first-target');
    first.service.update(type, 'second-target');
    t.is(first.service.views.outputSelection, 'second-target');
    // Older callers passed the string-valued view through a TypeScript cast.
    first.service.update((type.toString() as unknown) as VCamOutputType, 'third-target');
    first.service.update((type.toString() as unknown) as VCamOutputType, 'last-target');
    await Vue.nextTick();

    t.is(first.service.state.outputType, type, 'state remains numeric');
    t.is(first.service.views.outputSelection, 'last-target');
    t.deepEqual(first.calls[first.calls.length - 1], ['update', type, 'last-target']);
    const second = boot(storage);
    t.is(second.service.state.outputType, type);
    t.is(second.service.views.outputSelection, 'last-target');
  });
}

test('Virtual webcam selecting Program clears the target in state, OSN and persisted settings', async t => {
  const storage: Storage = new Map();
  const { service, calls } = boot(storage);
  service.update(VCamOutputType.SourceOutput, 'previous-source');
  await Vue.nextTick();
  service.update(VCamOutputType.ProgramView, 'ignored-target');
  await Vue.nextTick();
  t.deepEqual(calls[calls.length - 1], ['update', VCamOutputType.ProgramView, '']);
  t.deepEqual(saved(storage), {});
  const restarted = boot(storage).service;
  t.is(restarted.state.outputType, VCamOutputType.ProgramView);
  t.is(restarted.views.outputSelection, '');
});

test('Virtual webcam persists the target without persisting running or installation status', async t => {
  const storage: Storage = new Map();
  const { service } = boot(storage);
  service.update(VCamOutputType.SceneOutput, 'scene-id');
  service.start();
  await Vue.nextTick();
  t.true(service.state.running);
  t.deepEqual(saved(storage), {
    outputType: VCamOutputType.SceneOutput,
    outputSelection: 'scene-id',
  });
  const restarted = boot(storage, false).service;
  t.false(restarted.state.running);
  t.is(restarted.state.installStatus, 'notPresent');
  t.is(restarted.views.outputSelection, 'scene-id');
});

test('Virtual webcam uninstall clears persisted output settings', async t => {
  const storage: Storage = new Map();
  const { service } = boot(storage);
  service.update(VCamOutputType.SourceOutput, 'source-id');
  await Vue.nextTick();
  service.uninstall();
  await Vue.nextTick();
  t.deepEqual(saved(storage), {});
  t.is(service.views.outputSelection, '');
  t.is(boot(storage).service.state.outputType, VCamOutputType.ProgramView);
});

test('Virtual webcam failed uninstall preserves the saved selection', async t => {
  const storage: Storage = new Map();
  const { service, failUninstall } = boot(storage);
  service.update(VCamOutputType.SceneOutput, 'scene-id');
  await Vue.nextTick();
  failUninstall();
  service.uninstall();
  await Vue.nextTick();
  t.is(boot(storage).service.views.outputSelection, 'scene-id');
});

test('Virtual webcam ignores invalid saved types and transient state', t => {
  const storage = new Map([
    [
      storageKey,
      JSON.stringify({
        outputType: 999,
        outputSelection: 'stale-target',
        running: true,
        installStatus: 'installed',
      }),
    ],
  ]);
  const { service } = boot(storage, false);
  t.is(service.state.outputType, VCamOutputType.ProgramView);
  t.is(service.views.outputSelection, '');
  t.false(service.state.running);
  t.is(service.state.installStatus, 'notPresent');
});
