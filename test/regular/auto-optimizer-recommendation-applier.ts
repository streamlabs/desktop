import test from 'ava';
import { cloneDeep } from 'lodash';
import {
  applyAutoOptimizerRecommendations,
  IAutoOptimizerRecommendationApplierDependencies,
} from '../../app/services/auto-config/recommendation-applier';
import {
  IAutoOptimizerOutputResult,
  IAutoOptimizerResult,
} from '../../app/services/auto-config/types';

interface IMockOptions {
  corruptAppliedLiveVideo?: boolean;
  corruptRestoredLiveVideo?: boolean;
}

function findParameter(
  formData: Array<{ nameSubCategory: string; parameters: Array<{ name: string; value: unknown }> }>,
  subCategory: string,
  name: string,
) {
  return formData
    .find(group => group.nameSubCategory === subCategory)
    ?.parameters.find(parameter => parameter.name === name);
}

function createDependencies(options: IMockOptions = {}) {
  const initialRawOutput = [
    {
      nameSubCategory: 'Untitled',
      parameters: [{ name: 'Mode', value: 'Simple' }],
    },
    {
      nameSubCategory: 'Streaming',
      parameters: [
        { name: 'StreamEncoder', value: 'obs_x264' },
        { name: 'UseAdvanced', value: false },
        { name: 'VBitrate', value: 2500 },
        { name: 'Preset', value: 'veryfast' },
        { name: 'NVENCPreset2', value: 'p4' },
      ],
    },
  ];
  const initialHorizontal = {
    baseWidth: 1280,
    baseHeight: 720,
    outputWidth: 1280,
    outputHeight: 720,
    fpsNum: 30,
    fpsDen: 1,
  };
  const initialVertical = {
    baseWidth: 720,
    baseHeight: 1280,
    outputWidth: 720,
    outputHeight: 1280,
    fpsNum: 30,
    fpsDen: 1,
  };
  const settingsState = {
    Output: { type: 0, formData: cloneDeep(initialRawOutput) },
  };
  let output = {
    mode: 'Simple',
    inputResolution: '1280x720',
    framerate: { type: 'Common FPS Values', common: '30', integer: 30, fracNum: 30, fracDen: 1 },
    streaming: {
      bitrate: 2500,
      encoder: 'x264',
      encoderId: 'obs_x264',
      preset: 'veryfast',
    },
    recording: {},
    replayBuffer: {},
  };
  const videoState = {
    horizontal: cloneDeep(initialHorizontal),
    vertical: cloneDeep(initialVertical),
  };
  const contexts = {
    horizontal: { video: cloneDeep(initialHorizontal) },
    vertical: { video: cloneDeep(initialVertical) },
  };
  const events: string[] = [];
  let outputMutationCount = 0;

  const rawValue = (subCategory: string, name: string) =>
    findParameter(settingsState.Output.formData, subCategory, name)?.value;
  const setRawValue = (subCategory: string, name: string, value: unknown) => {
    const parameter = findParameter(settingsState.Output.formData, subCategory, name);
    if (!parameter) throw new Error(`Missing mock Output field ${subCategory}.${name}`);
    parameter.value = value;
  };
  const syncOutputFromRaw = () => {
    const encoderId = String(rawValue('Streaming', 'StreamEncoder'));
    const nvenc = encoderId === 'obs_nvenc_h264_tex';
    output = {
      ...output,
      mode: String(rawValue('Untitled', 'Mode')),
      streaming: {
        ...output.streaming,
        bitrate: Number(rawValue('Streaming', 'VBitrate')),
        encoder: nvenc ? 'obs_nvenc_h264_tex' : 'x264',
        encoderId,
        preset: String(rawValue('Streaming', nvenc ? 'NVENCPreset2' : 'Preset')),
      },
    };
  };

  const dependencies = ({
    outputSettings: {
      getSettings: () => cloneDeep(output),
      setSettings: (patch: {
        streaming?: {
          bitrate?: number;
          encoder?: string;
          encoderId?: string;
          preset?: string;
        };
      }) => {
        events.push('set-output');
        outputMutationCount += 1;
        output = {
          ...output,
          streaming: { ...output.streaming, ...(patch.streaming || {}) },
        };
        if (patch.streaming?.encoderId) {
          setRawValue('Streaming', 'StreamEncoder', patch.streaming.encoderId);
        }
        if (patch.streaming?.bitrate != null) {
          setRawValue('Streaming', 'VBitrate', patch.streaming.bitrate);
        }
        if (patch.streaming?.preset != null) {
          const presetField =
            patch.streaming.encoderId === 'obs_nvenc_h264_tex' ||
            output.streaming.encoderId === 'obs_nvenc_h264_tex'
              ? 'NVENCPreset2'
              : 'Preset';
          setRawValue('Streaming', presetField, patch.streaming.preset);
        }
      },
    },
    encoderQuery: {
      resolveStreamingEncoderPreset: (_mode: string, encoderId: string) =>
        encoderId === 'obs_nvenc_h264_tex' ? 'NVENCPreset2' : 'Preset',
    },
    settings: {
      state: settingsState,
      findSettingValue: (formData: typeof initialRawOutput, subCategory: string, name: string) =>
        findParameter(formData, subCategory, name)?.value,
      findSetting: (formData: typeof initialRawOutput, subCategory: string, name: string) =>
        findParameter(formData, subCategory, name),
      setSettings: (_category: string, formData: typeof initialRawOutput) => {
        events.push('set-raw-output');
        settingsState.Output.formData = cloneDeep(formData);
        syncOutputFromRaw();
      },
    },
    videoSettings: {
      state: videoState,
      contexts,
      flushPendingCanvasSettings: async () => {
        events.push('flush-video');
      },
      applyAutoOptimizerSettings: async (
        patches: Partial<Record<'horizontal' | 'vertical', Partial<typeof initialHorizontal>>>,
      ) => {
        events.push('apply-video');
        (['horizontal', 'vertical'] as const).forEach(display => {
          const patch = patches[display];
          if (!patch) return;
          videoState[display] = { ...videoState[display], ...patch };
          contexts[display].video = { ...contexts[display].video, ...patch };
        });
        if (patches.horizontal?.outputWidth === 1920 && options.corruptAppliedLiveVideo) {
          contexts.horizontal.video.outputWidth = 1919;
        }
        if (patches.horizontal?.outputWidth === 1280 && options.corruptRestoredLiveVideo) {
          contexts.horizontal.video.outputWidth = 1279;
        }
      },
    },
  } as unknown) as IAutoOptimizerRecommendationApplierDependencies;

  return {
    dependencies,
    events,
    initialRawOutput,
    initialHorizontal,
    initialVertical,
    get output() {
      return output;
    },
    get rawOutput() {
      return settingsState.Output.formData;
    },
    get videoState() {
      return videoState;
    },
    get contexts() {
      return contexts;
    },
    get outputMutationCount() {
      return outputMutationCount;
    },
  };
}

function standardOutput(
  patch: Partial<IAutoOptimizerOutputResult> = {},
): IAutoOptimizerOutputResult {
  return {
    outputId: 'horizontal',
    display: 'horizontal',
    outputKind: 'standard',
    destinations: [{ platform: 'youtube' }],
    measurement: 'active',
    confidence: 'high',
    resolution: { width: 1920, height: 1080 },
    fpsNum: 60,
    fpsDen: 1,
    fps: 60,
    bitrate: 6000,
    encoder: {
      id: 'obs_nvenc_h264_tex',
      family: 'obs_nvenc_h264_tex',
      title: 'NVIDIA NVENC H.264',
      codec: 'h264',
      preset: 'p5',
    },
    ...patch,
  };
}

function result(outputs: IAutoOptimizerOutputResult[]): IAutoOptimizerResult {
  return {
    schemaVersion: 1,
    streamSetup: 'direct-single',
    status: 'complete',
    outputs,
  };
}

test('applies and verifies one standard recommendation after flushing pending canvas edits', async t => {
  const harness = createDependencies();
  const recommendation = result([standardOutput()]);

  const profile = await applyAutoOptimizerRecommendations(
    recommendation,
    'direct-single',
    harness.dependencies,
  );

  t.is(harness.events[0], 'flush-video');
  t.is(harness.output.streaming.bitrate, 6000);
  t.is(harness.output.streaming.encoderId, 'obs_nvenc_h264_tex');
  t.is(harness.output.streaming.preset, 'p5');
  t.true(findParameter(harness.rawOutput, 'Streaming', 'UseAdvanced')?.value === true);
  t.deepEqual(harness.videoState.horizontal, {
    baseWidth: 1920,
    baseHeight: 1080,
    outputWidth: 1920,
    outputHeight: 1080,
    fpsNum: 60,
    fpsDen: 1,
  });
  t.is(harness.contexts.horizontal.video.outputWidth, 1920);
  t.is(harness.videoState.vertical.fpsNum, 60);
  t.deepEqual(profile, {
    schemaVersion: 1,
    streamSetup: 'direct-single',
    outputs: recommendation.outputs,
  });
  t.not(profile.outputs, recommendation.outputs);
});

test('applies one standard recommendation atomically to both Dual Output canvases', async t => {
  const harness = createDependencies();
  const recommendation = result([
    standardOutput({ outputId: 'horizontal', destinations: [{ platform: 'twitch' }] }),
    standardOutput({
      outputId: 'vertical',
      display: 'vertical',
      resolution: { width: 1080, height: 1920 },
    }),
  ]);

  const profile = await applyAutoOptimizerRecommendations(
    recommendation,
    'dual-output',
    harness.dependencies,
  );

  t.is(harness.outputMutationCount, 2, 'encoder activation and final settings share one output');
  t.is(harness.output.streaming.bitrate, 6000);
  t.is(harness.videoState.horizontal.outputWidth, 1920);
  t.is(harness.videoState.horizontal.outputHeight, 1080);
  t.is(harness.videoState.vertical.outputWidth, 1080);
  t.is(harness.videoState.vertical.outputHeight, 1920);
  t.is(harness.videoState.horizontal.fpsNum, 60);
  t.is(harness.videoState.vertical.fpsNum, 60);
  t.deepEqual(profile.outputs, recommendation.outputs);
});

test('an active provider-owned result applies video only', async t => {
  const harness = createDependencies();
  const recommendation = result([
    standardOutput({
      outputId: 'twitch-enhanced-broadcasting',
      outputKind: 'twitch-enhanced-broadcasting',
      destinations: [{ platform: 'twitch' }],
      bitrate: 0,
      encoder: undefined,
    }),
  ]);

  await applyAutoOptimizerRecommendations(
    recommendation,
    'enhanced-broadcasting',
    harness.dependencies,
  );

  t.is(harness.outputMutationCount, 0);
  t.is(harness.output.streaming.bitrate, 2500);
  t.is(harness.videoState.horizontal.outputWidth, 1920);
  t.is(harness.videoState.vertical.fpsNum, 60);
});

test('rejects mismatched output cadence before mutating settings', async t => {
  const harness = createDependencies();
  const recommendation = result([
    standardOutput({ outputId: 'horizontal' }),
    standardOutput({
      outputId: 'vertical',
      display: 'vertical',
      resolution: { width: 1080, height: 1920 },
      fpsNum: 30,
      fps: 30,
    }),
  ]);

  await t.throwsAsync(
    applyAutoOptimizerRecommendations(recommendation, 'dual-output', harness.dependencies),
    { message: 'This stream setup cannot apply different frame rates per output' },
  );
  t.deepEqual(harness.events, ['flush-video']);
});

test('a failed live verification restores raw Output, dormant preset, and both video contexts', async t => {
  const harness = createDependencies({ corruptAppliedLiveVideo: true });

  await t.throwsAsync(
    applyAutoOptimizerRecommendations(
      result([standardOutput()]),
      'direct-single',
      harness.dependencies,
    ),
    { message: 'Failed to apply the recommended horizontal video settings' },
  );

  t.deepEqual(harness.rawOutput, harness.initialRawOutput);
  t.is(harness.output.streaming.encoderId, 'obs_x264');
  t.is(harness.output.streaming.preset, 'veryfast');
  t.deepEqual(harness.videoState.horizontal, harness.initialHorizontal);
  t.deepEqual(harness.videoState.vertical, harness.initialVertical);
  t.deepEqual(harness.contexts.horizontal.video, harness.initialHorizontal);
  t.deepEqual(harness.contexts.vertical.video, harness.initialVertical);
});

test('reports a fatal transaction error when rollback verification is incomplete', async t => {
  const harness = createDependencies({
    corruptAppliedLiveVideo: true,
    corruptRestoredLiveVideo: true,
  });

  await t.throwsAsync(
    applyAutoOptimizerRecommendations(
      result([standardOutput()]),
      'direct-single',
      harness.dependencies,
    ),
    { message: 'Auto Optimizer failed and could not fully restore previous settings' },
  );
});
