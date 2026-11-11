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
 * An optimized profile is fetched for the encoder selected at that time, and applying it
 * writes that encoder back. goLive must skip a profile fetched for a different encoder (e.g.
 * an HEVC profile after "Use H.264 Codec"), apply a matching one, pick the cached profile on
 * unattended starts, and re-check the codec after applying it.
 *
 * These tests run the real goLive on an isolated StreamingService fixture. Its collaborators
 * are stubbed, every mutation it reaches is replaced so the real store is never written, and
 * the codec and family are resolved through the real OutputSettingsService lookups for each
 * output mode against stubbed Output settings. The fake optimizer's applyProfile writes the
 * profile's encoder into Advanced mode, as the real one does. No output is started and no
 * encoder hardware is required.
 *
 * setPlatformSettings is the only path from goLive to a platform's beforeGoLive hook, so the
 * fixture replaces it with a recorder. finishStartStreaming records the codec that would start.
 */

type TMode = 'Simple' | 'Advanced';
type TCodec = 'h264' | 'hevc' | 'av1';

interface IScenario {
  platform: 'kick' | 'twitter';
  /** Codec of the selected streaming encoder, or 'unresolved' for an encoder with no metadata. */
  selected: TCodec | 'unresolved';
  /** Codec of the profile loaded in the Go Live settings (`settings.optimizedProfile`). */
  windowProfile?: TCodec;
  /** Codec of the optimizer's cached profile (`state.lastSelectedProfile`). */
  cachedProfile?: TCodec;
  useOptimizedProfile?: boolean;
  /** Start without Go Live settings, as unattended starts do. */
  unattended?: boolean;
}

interface IScenarioResult {
  scenario: IScenario;
  thrownType: string | null;
  errorType: string | null;
  errorPlatform: string | null;
  events: string[];
  codecQueries: string[];
  appliedProfiles: string[];
  unexpectedError?: string;
}

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
        // An optimized profile stores the encoder family, which for NVENC is the Advanced id.
        const familyByCodec: Record<TCodec, string> = encoderByMode.Advanced;
        const UNRESOLVED_ENCODER = 'legacy_unknown_encoder';

        const codecByEncoder: Record<string, TCodec> = { obs_x264: 'h264', x264: 'h264' };
        const familyByEncoder: Record<string, string> = { obs_x264: 'x264', x264: 'x264' };
        (['Simple', 'Advanced'] as TMode[]).forEach(m => {
          (Object.keys(encoderByMode[m]) as TCodec[]).forEach(c => {
            codecByEncoder[encoderByMode[m][c]] = c;
            familyByEncoder[encoderByMode[m][c]] = familyByCodec[c];
          });
        });

        const define = (target: any, values: Record<string, unknown>) => {
          Object.keys(values).forEach(key => {
            Object.defineProperty(target, key, { value: values[key], writable: true });
          });
        };

        const profile = (source: string, codec: TCodec) => ({
          game: 'test',
          encoder: familyByCodec[codec],
          codec,
          bitrateMin: 0,
          bitrateMax: 0,
          presetIn: '',
          presetOut: '',
          resolutionIn: '',
          resolutionOut: '',
          options: '',
          description: `${source}-${codec}`,
        });

        const runScenario = (scenario: IScenario): Promise<IScenarioResult> => {
          const events: string[] = [];
          const codecQueries: string[] = [];
          const appliedProfiles: string[] = [];
          let recordCodecQueries = true;
          const record = (event: string) => () => {
            events.push(event);
          };

          // Output settings with the selected encoder in the field this mode reads, and an
          // H.264 decoy in the other mode's field, so a lookup through the wrong field passes
          // the guard and fails the rejection cases.
          const selected =
            scenario.selected === 'unresolved'
              ? UNRESOLVED_ENCODER
              : encoderByMode[outputMode][scenario.selected];
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
          const setOutputValue = (name: string, value: string) => {
            formData.forEach(subCategory => {
              subCategory.parameters.forEach(p => {
                if (p.name === name) p.value = value;
              });
            });
          };

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
                if (recordCodecQueries) codecQueries.push(`${mode}:${encoder}`);
                return codecByEncoder[encoder];
              },
              resolveStreamingEncoderFamily: (_mode: string, encoder: string) =>
                familyByEncoder[encoder],
            },
          });

          const optimizerState = {
            useOptimizedProfile: !!scenario.useOptimizedProfile,
            lastSelectedProfile: scenario.cachedProfile
              ? profile('cached', scenario.cachedProfile)
              : null,
          };
          const optimizer = {
            state: optimizerState,
            canApplyProfileFromCache: () =>
              !!(optimizerState.useOptimizedProfile && optimizerState.lastSelectedProfile),
            // Like the real applyProfile: writes the profile's encoder and moves Simple mode
            // to Advanced.
            applyProfile: (applied: { description: string; encoder: string }) => {
              appliedProfiles.push(applied.description);
              events.push(`applyProfile:${applied.description}`);
              setOutputValue('Mode', 'Advanced');
              setOutputValue('Encoder', applied.encoder);
            },
          };

          const goLiveSettings = {
            platforms: { [scenario.platform]: { enabled: true } },
            customDestinations: [] as unknown[],
            streamShift: false,
            optimizedProfile: scenario.windowProfile
              ? profile('window', scenario.windowProfile)
              : undefined,
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
            videoEncodingOptimizationService: optimizer,
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
              // The codec the output would start with, through the same lookup the guard
              // uses. Not counted as a guard query.
              recordCodecQueries = false;
              const codec = outputSettings.getStreamingEncoderCodec();
              recordCodecQueries = true;
              events.push(`startOutput:${codec}`);
              return Promise.resolve();
            },
            getIsStreamingStatus: () => false,
          });

          const result = (thrownType: string | null, unexpectedError?: string) => ({
            scenario,
            thrownType,
            errorType: state.info.error ? state.info.error.type : null,
            errorPlatform: state.info.error ? state.info.error.platform : null,
            events,
            codecQueries,
            appliedProfiles,
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
            started = Promise.resolve(
              scenario.unattended ? streaming.goLive() : streaming.goLive(goLiveSettings),
            );
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
                  scenario: runs[0],
                  thrownType: null,
                  errorType: null,
                  errorPlatform: null,
                  events: [],
                  codecQueries: [],
                  appliedProfiles: [],
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

async function runOne(t: TExecutionContext, mode: TMode, scenario: IScenario) {
  const [result] = await runGoLive(t, mode, [scenario]);
  t.falsy(result.unexpectedError, 'goLive fails only with a stream error, if at all');
  return result;
}

const ENCODER_BY_MODE: Record<TMode, Record<TCodec, string>> = {
  Simple: { h264: 'nvenc', hevc: 'nvenc_hevc', av1: 'nvenc_av1' },
  Advanced: { h264: 'obs_nvenc_h264_tex', hevc: 'obs_nvenc_hevc_tex', av1: 'obs_nvenc_av1_tex' },
};

const PLATFORMS: IScenario['platform'][] = ['kick', 'twitter'];

for (const mode of ['Simple', 'Advanced'] as TMode[]) {
  test(`${mode} Go Live rejects HEVC/AV1 for Kick and X before platform setup`, async t => {
    const scenarios: IScenario[] = [];
    PLATFORMS.forEach(platform => {
      (['hevc', 'av1'] as TCodec[]).forEach(selected => scenarios.push({ platform, selected }));
    });
    const results = await runGoLive(t, mode, scenarios);
    t.is(results.length, 4);

    for (const r of results) {
      const label = `${mode} ${r.scenario.platform} ${r.scenario.selected}`;
      t.falsy(r.unexpectedError, `${label}: goLive should fail only with a stream error`);
      t.is(r.thrownType, 'PLATFORM_UNSUPPORTED_CODEC', `${label}: thrown error type`);
      t.is(r.errorType, 'PLATFORM_UNSUPPORTED_CODEC', `${label}: reported error type`);
      t.is(r.errorPlatform, r.scenario.platform, `${label}: reported error platform`);
      t.deepEqual(r.events, [], `${label}: no beforeGoLive hook and no output start`);
      t.deepEqual(
        r.codecQueries,
        [`${mode}:${ENCODER_BY_MODE[mode][r.scenario.selected as TCodec]}`],
        `${label}: codec resolved from the ${mode} encoder setting`,
      );
    }
  });

  test(`${mode} Go Live with H.264 to Kick and X proceeds to platform setup and output start`, async t => {
    const results = await runGoLive(
      t,
      mode,
      PLATFORMS.map(platform => ({ platform, selected: 'h264' as TCodec })),
    );
    t.is(results.length, 2);

    for (const r of results) {
      const label = `${mode} ${r.scenario.platform} h264`;
      t.falsy(r.unexpectedError, `${label}: no unexpected error`);
      t.is(r.thrownType, null, `${label}: goLive does not throw`);
      t.is(r.errorType, null, `${label}: no error reported`);
      t.deepEqual(
        r.events,
        [`beforeGoLive:${r.scenario.platform}`, 'startOutput:h264'],
        `${label}: runs the platform hook, then starts the output with H.264`,
      );
      t.deepEqual(r.codecQueries, [`${mode}:${ENCODER_BY_MODE[mode].h264}`]);
    }
  });

  test(`${mode} Go Live skips a stale HEVC profile after switching to H.264`, async t => {
    const r = await runOne(t, mode, {
      platform: 'kick',
      selected: 'h264',
      windowProfile: 'hevc',
      useOptimizedProfile: true,
    });

    t.is(r.thrownType, null);
    t.is(r.errorType, null);
    t.deepEqual(r.appliedProfiles, [], 'the HEVC profile is not applied');
    t.deepEqual(
      r.events,
      ['beforeGoLive:kick', 'startOutput:h264'],
      'the output starts with the H.264 encoder the user switched to',
    );
  });

  test(`${mode} Go Live applies a profile fetched for the selected encoder`, async t => {
    const r = await runOne(t, mode, {
      platform: 'kick',
      selected: 'h264',
      windowProfile: 'h264',
      useOptimizedProfile: true,
    });

    t.is(r.thrownType, null);
    t.is(r.errorType, null);
    t.deepEqual(r.appliedProfiles, ['window-h264'], 'the matching profile is applied');
    t.deepEqual(r.events, ['beforeGoLive:kick', 'applyProfile:window-h264', 'startOutput:h264']);
  });

  test(`${mode} unattended Go Live applies the matching cached profile`, async t => {
    const r = await runOne(t, mode, {
      platform: 'kick',
      selected: 'h264',
      windowProfile: 'hevc',
      cachedProfile: 'h264',
      useOptimizedProfile: true,
      unattended: true,
    });

    t.is(r.thrownType, null);
    t.is(r.errorType, null);
    t.deepEqual(
      r.appliedProfiles,
      ['cached-h264'],
      'the cached profile is used, not the one in the saved Go Live settings',
    );
    t.deepEqual(r.events, ['beforeGoLive:kick', 'applyProfile:cached-h264', 'startOutput:h264']);
  });

  test(`${mode} unattended Go Live skips a stale cached HEVC profile`, async t => {
    const r = await runOne(t, mode, {
      platform: 'kick',
      selected: 'h264',
      windowProfile: 'h264',
      cachedProfile: 'hevc',
      useOptimizedProfile: true,
      unattended: true,
    });

    t.is(r.thrownType, null);
    t.is(r.errorType, null);
    t.deepEqual(
      r.appliedProfiles,
      [],
      'the stale cached profile is skipped and the saved profile is not substituted',
    );
    t.deepEqual(r.events, ['beforeGoLive:kick', 'startOutput:h264']);
  });

  test(`${mode} Go Live re-checks the codec after an applied profile switches to HEVC`, async t => {
    // With no family for the selected encoder, the profile is applied as before. It writes
    // HEVC, which the second check must catch before the output starts.
    const r = await runOne(t, mode, {
      platform: 'kick',
      selected: 'unresolved',
      windowProfile: 'hevc',
      useOptimizedProfile: true,
    });

    t.deepEqual(r.appliedProfiles, ['window-hevc']);
    t.is(r.thrownType, 'PLATFORM_UNSUPPORTED_CODEC');
    t.is(r.errorType, 'PLATFORM_UNSUPPORTED_CODEC');
    t.is(r.errorPlatform, 'kick');
    t.deepEqual(
      r.events,
      ['beforeGoLive:kick', 'applyProfile:window-hevc'],
      'the output never starts',
    );
  });
}
