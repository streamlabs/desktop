import { focusMain, focusWindow } from '../../helpers/modules/core';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

/**
 * Service-level coverage for the Go Live platform codec guard.
 *
 * Kick and X are configured as rtmp_custom, which declares no codecs, so OSN starts an
 * HEVC/AV1 stream to them and the ingest drops it right after connecting. StreamingService
 * .goLive must reject that with PLATFORM_UNSUPPORTED_CODEC before any platform is set up,
 * including starts that bypass the Go Live window.
 *
 * These tests run the real goLive on an isolated StreamingService fixture. Its collaborators
 * are stubbed, every mutation it reaches is replaced so the real store is never written, and
 * the codec is resolved through the real OutputSettingsService lookup for each output mode
 * against stubbed Output settings. No output is started and no encoder hardware is required.
 *
 * setPlatformSettings is the only path from goLive to a platform's beforeGoLive hook, so the
 * fixture replaces it with a recorder.
 */

type TMode = 'Simple' | 'Advanced';
type TCodec = 'h264' | 'hevc' | 'av1';

interface IScenario {
  platform: 'kick' | 'twitter';
  codec: TCodec;
}

interface IScenarioResult extends IScenario {
  thrownType: string | null;
  errorType: string | null;
  errorPlatform: string | null;
  events: string[];
  codecQueries: string[];
  unexpectedError?: string;
}

const SCENARIOS: IScenario[] = [
  { platform: 'kick', codec: 'h264' },
  { platform: 'kick', codec: 'hevc' },
  { platform: 'kick', codec: 'av1' },
  { platform: 'twitter', codec: 'h264' },
  { platform: 'twitter', codec: 'hevc' },
  { platform: 'twitter', codec: 'av1' },
];

async function runGoLive(
  t: TExecutionContext,
  mode: TMode,
  scenarios: IScenario[],
): Promise<IScenarioResult[]> {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    return (await t.context.app.client.executeAsync(
      (outputMode: TMode, runs: IScenario[], done: (results: IScenarioResult[]) => void) => {
        // This callback is serialized and run in the worker, so it must not compile to TS
        // emit helpers: no async/await (`__awaiter`) and no object rest (`__rest`).
        const servicesManager = (window as any).servicesManager;
        const streamingPrototype = Object.getPrototypeOf(
          servicesManager.getResource('StreamingService'),
        );
        const outputPrototype = Object.getPrototypeOf(
          servicesManager.getResource('OutputSettingsService'),
        );
        const settingsPrototype = Object.getPrototypeOf(
          servicesManager.getResource('SettingsService'),
        );

        // Stored encoder values for each codec, as each output mode saves them.
        const encoderByMode: Record<TMode, Record<TCodec, string>> = {
          Simple: { h264: 'nvenc', hevc: 'nvenc_hevc', av1: 'nvenc_av1' },
          Advanced: {
            h264: 'obs_nvenc_h264_tex',
            hevc: 'obs_nvenc_hevc_tex',
            av1: 'obs_nvenc_av1_tex',
          },
        };
        const codecByEncoder: Record<string, TCodec> = {
          obs_x264: 'h264',
          x264: 'h264',
        };
        (['Simple', 'Advanced'] as TMode[]).forEach(m => {
          (Object.keys(encoderByMode[m]) as TCodec[]).forEach(c => {
            codecByEncoder[encoderByMode[m][c]] = c;
          });
        });

        const define = (target: any, values: Record<string, unknown>) => {
          Object.keys(values).forEach(key => {
            Object.defineProperty(target, key, { value: values[key], writable: true });
          });
        };

        const runScenario = (scenario: IScenario): Promise<IScenarioResult> => {
          const events: string[] = [];
          const codecQueries: string[] = [];
          const record = (event: string) => () => {
            events.push(event);
          };

          // Output settings with the selected encoder in the field this mode reads, and an
          // H.264 decoy in the other mode's field, so a lookup through the wrong field passes
          // the guard and fails the rejection cases.
          const selected = encoderByMode[outputMode][scenario.codec];
          const decoy = outputMode === 'Advanced' ? 'x264' : 'obs_x264';
          const param = (name: string, value: string) => ({ name, value });
          const formData = [
            { nameSubCategory: 'Untitled', parameters: [param('Mode', outputMode)] },
            {
              nameSubCategory: 'Streaming',
              parameters: [
                param('Encoder', outputMode === 'Advanced' ? selected : decoy),
                param('StreamEncoder', outputMode === 'Simple' ? selected : decoy),
              ],
            },
          ];

          const settingsFixture = Object.create(settingsPrototype);
          define(settingsFixture, {
            state: { Output: { formData } },
            validateEncoders: record('validateEncoders'),
          });

          const outputSettings = Object.create(outputPrototype);
          define(outputSettings, {
            settingsService: settingsFixture,
            encoderQueryService: {
              resolveStreamingEncoderCodec: (mode: string, encoder: string) => {
                codecQueries.push(`${mode}:${encoder}`);
                return codecByEncoder[encoder];
              },
            },
          });

          const goLiveSettings = {
            platforms: { [scenario.platform]: { enabled: true } },
            customDestinations: [] as unknown[],
            streamShift: false,
          };
          const state = { info: { error: null as any, checklist: {} as Record<string, string> } };

          const streaming = Object.create(streamingPrototype);
          define(streaming, {
            state,
            views: {
              isTwitchDualStreaming: false,
              shouldSetupRestream: false,
              protectedModeEnabled: true,
              isTwitchUnprotectedStream: false,
              isDualOutputMode: false,
              enabledPlatforms: [scenario.platform],
              savedSettings: goLiveSettings,
              getPlatformDisplayName: (platform: string) => platform,
            },
            userService: {
              isLoggedIn: true,
              state: { auth: { primaryPlatform: scenario.platform } },
              setPrimaryPlatform: record('setPrimaryPlatform'),
            },
            settingsService: settingsFixture,
            outputSettingsService: outputSettings,
            restreamService: { views: { hasStreamShiftTargets: false } },
            streamSettingsService: {
              applyStreamOutputLimits: () => Promise.resolve(),
              setSettings: () => {},
            },
            videoSettingsService: { contexts: {} },
            videoEncodingOptimizationService: { state: { useOptimizedProfile: false } },
            streamErrorCreated: { next: () => {} },
            // Mutations commit to the shared store, so every one goLive reaches is replaced.
            RESET_STREAM_INFO: () => {},
            RESET_ERROR: () => {},
            SET_GO_LIVE_SETTINGS: () => {},
            UPDATE_STREAM_INFO: () => {},
            SET_CHECKLIST_ITEM: (name: string, status: string) => {
              state.info.checklist[name] = status;
            },
            SET_WARNING: () => {},
            SET_ENHANCED_BROADCASTING: () => {},
            SET_ERROR: (error: unknown) => {
              state.info.error = error;
            },
            setPlatformSettings: (platform: string) => {
              events.push(`beforeGoLive:${platform}`);
              return Promise.resolve();
            },
            finishStartStreaming: () => {
              events.push('startOutput');
              return Promise.resolve();
            },
            getIsStreamingStatus: () => false,
          });

          const result = (thrownType: string | null, unexpectedError?: string) => ({
            platform: scenario.platform,
            codec: scenario.codec,
            thrownType,
            errorType: state.info.error ? state.info.error.type : null,
            errorPlatform: state.info.error ? state.info.error.platform : null,
            events,
            codecQueries,
            unexpectedError,
          });

          // A rejected Go Live reports through console.error by design. Keep that expected
          // output out of the application log, which fails the test on any error line.
          const originalConsoleError = console.error;
          console.error = () => {};
          const restore = () => {
            console.error = originalConsoleError;
          };

          let started: Promise<unknown>;
          try {
            started = Promise.resolve(streaming.goLive(goLiveSettings));
          } catch (e: unknown) {
            started = Promise.reject(e);
          }

          return started.then(
            () => {
              restore();
              return result(null);
            },
            (e: any) => {
              restore();
              return e && e.type
                ? result(e.type)
                : result(null, e instanceof Error ? e.message : String(e));
            },
          );
        };

        const results: IScenarioResult[] = [];
        runs
          .reduce(
            (chain, scenario) =>
              chain
                .then(() => runScenario(scenario))
                .then(r => {
                  results.push(r);
                }),
            Promise.resolve(),
          )
          .then(
            () => done(results),
            (e: unknown) =>
              done([
                {
                  platform: 'kick',
                  codec: 'h264',
                  thrownType: null,
                  errorType: null,
                  errorPlatform: null,
                  events: [],
                  codecQueries: [],
                  unexpectedError: e instanceof Error ? e.message : String(e),
                },
              ]),
          );
      },
      mode,
      scenarios,
    )) as IScenarioResult[];
  } finally {
    await focusMain();
  }
}

const ENCODER_BY_MODE: Record<TMode, Record<TCodec, string>> = {
  Simple: { h264: 'nvenc', hevc: 'nvenc_hevc', av1: 'nvenc_av1' },
  Advanced: { h264: 'obs_nvenc_h264_tex', hevc: 'obs_nvenc_hevc_tex', av1: 'obs_nvenc_av1_tex' },
};

for (const mode of ['Simple', 'Advanced'] as TMode[]) {
  test(`${mode} Go Live rejects HEVC/AV1 for Kick and X before platform setup`, async t => {
    const results = await runGoLive(
      t,
      mode,
      SCENARIOS.filter(s => s.codec !== 'h264'),
    );
    t.is(results.length, 4);

    for (const r of results) {
      const label = `${mode} ${r.platform} ${r.codec}`;
      t.falsy(r.unexpectedError, `${label}: goLive should fail only with a stream error`);
      t.is(r.thrownType, 'PLATFORM_UNSUPPORTED_CODEC', `${label}: thrown error type`);
      t.is(r.errorType, 'PLATFORM_UNSUPPORTED_CODEC', `${label}: reported error type`);
      t.is(r.errorPlatform, r.platform, `${label}: reported error platform`);
      t.deepEqual(r.events, [], `${label}: no beforeGoLive hook and no output start`);
      t.deepEqual(
        r.codecQueries,
        [`${mode}:${ENCODER_BY_MODE[mode][r.codec]}`],
        `${label}: codec resolved from the ${mode} encoder setting`,
      );
    }
  });

  test(`${mode} Go Live with H.264 to Kick and X proceeds to platform setup and output start`, async t => {
    const results = await runGoLive(
      t,
      mode,
      SCENARIOS.filter(s => s.codec === 'h264'),
    );
    t.is(results.length, 2);

    for (const r of results) {
      const label = `${mode} ${r.platform} h264`;
      t.falsy(r.unexpectedError, `${label}: no unexpected error`);
      t.is(r.thrownType, null, `${label}: goLive does not throw`);
      t.is(r.errorType, null, `${label}: no error reported`);
      t.deepEqual(
        r.events,
        [`beforeGoLive:${r.platform}`, 'startOutput'],
        `${label}: runs the platform hook, then starts the output`,
      );
      t.deepEqual(r.codecQueries, [`${mode}:${ENCODER_BY_MODE[mode].h264}`]);
    }
  });
}
