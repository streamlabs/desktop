import test from 'ava';
import {
  acceptAutoOptimizerResult,
  IAutoOptimizerAttemptContext,
} from '../../app/services/auto-optimizer/result-acceptance';
import { IAutoOptimizerNativeResult } from '../../app/services/auto-optimizer/types';

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function standardAttempt(): IAutoOptimizerAttemptContext {
  return {
    streamSetup: {
      type: 'direct-single',
      outputs: [
        {
          outputId: 'horizontal',
          display: 'horizontal',
          outputKind: 'standard',
          destinations: [{ platform: 'twitch' }],
          probeCandidates: [
            {
              probeId: 'horizontal-twitch',
              kind: 'twitch-standard',
              outputId: 'horizontal',
              platform: 'twitch',
            },
          ],
          measurement: 'active',
        },
      ],
    },
    outputs: [
      {
        outputId: 'horizontal',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: ['twitch'],
        current: {
          canvasId: 0,
          width: 1280,
          height: 720,
          fpsNum: 30,
          fpsDen: 1,
          bitrateKbps: 3000,
          encoderId: 'obs_nvenc_h264_tex',
          preset: 'p5',
        },
        limits: {
          maxBitrateKbps: 8000,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFpsNum: 60,
          maxFpsDen: 1,
        },
      },
    ],
  };
}

function standardNativeResult(): IAutoOptimizerNativeResult {
  return {
    status: 'complete',
    outputs: [
      {
        outputId: 'horizontal',
        videos: [
          {
            display: 'horizontal',
            width: 1920,
            height: 1080,
            fpsNum: 60,
            fpsDen: 1,
          },
        ],
        encoding: {
          bitrateKbps: 6000,
          encoderId: 'obs_nvenc_h264_tex',
          encoderFamily: 'obs_nvenc_h264_tex',
          encoderTitle: 'NVIDIA NVENC H.264',
          codec: 'h264',
          preset: 'p5',
        },
        measurement: {
          mode: 'active',
          confidence: 'high',
          evidence: [
            {
              platform: 'twitch',
              method: 'twitch-bandwidth-test',
              success: true,
            },
          ],
        },
      },
    ],
  };
}

test('a complete OSN result is projected from the saved non-secret request context', t => {
  const context = standardAttempt();
  const serializedContext = JSON.stringify(context);
  t.false(serializedContext.includes('streamKey'));
  t.false(serializedContext.includes('server'));
  t.false(serializedContext.includes('probes'));

  const result = acceptAutoOptimizerResult(standardNativeResult(), context);
  t.deepEqual(result, {
    schemaVersion: 1,
    streamSetup: 'direct-single',
    status: 'complete',
    outputs: [
      {
        outputId: 'horizontal',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: [{ platform: 'twitch' }],
        measurement: 'active',
        confidence: 'high',
        probes: [
          {
            platform: 'twitch',
            method: 'twitch-bandwidth-test',
            success: true,
          },
        ],
        estimateReason: undefined,
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
      },
    ],
  });
  t.false('advice' in result!);
});

test('YouTube bandwidth can support a jointly tested Kick canvas without claiming Kick was measured', t => {
  const context = standardAttempt();
  context.streamSetup.type = 'dual-output';
  const youtubeSetup = copy(context.streamSetup.outputs[0]);
  youtubeSetup.outputId = 'vertical';
  youtubeSetup.display = 'vertical';
  youtubeSetup.destinations = [{ platform: 'youtube' }];
  youtubeSetup.probeCandidates = [
    {
      probeId: 'vertical-youtube',
      outputId: 'vertical',
      platform: 'youtube',
      kind: 'youtube-unbound',
    },
  ];
  context.streamSetup.outputs[0].destinations = [{ platform: 'kick' }];
  context.streamSetup.outputs[0].measurement = 'estimated';
  context.streamSetup.outputs[0].probeCandidates = [];
  context.streamSetup.outputs.push(youtubeSetup);
  const youtubeRequest = copy(context.outputs[0]);
  youtubeRequest.outputId = 'vertical';
  youtubeRequest.display = 'vertical';
  youtubeRequest.destinations = ['youtube'];
  youtubeRequest.current = { ...youtubeRequest.current, canvasId: 1, width: 720, height: 1280 };
  youtubeRequest.limits = { ...youtubeRequest.limits, maxWidth: 1080, maxHeight: 1920 };
  context.outputs[0].destinations = ['kick'];
  context.outputs.push(youtubeRequest);
  const native = standardNativeResult();
  const youtubeResult = copy(native.outputs[0]);
  youtubeResult.outputId = 'vertical';
  youtubeResult.videos[0] = {
    ...youtubeResult.videos[0],
    display: 'vertical',
    width: 1080,
    height: 1920,
  };
  youtubeResult.measurement.evidence = [
    { platform: 'youtube', method: 'youtube-unbound-ramp', success: true },
  ];
  native.outputs[0].measurement = {
    mode: 'estimated',
    confidence: 'medium',
    reason: 'shared_upload_estimate',
  };
  native.outputs.push(youtubeResult);
  const accepted = acceptAutoOptimizerResult(native, context);
  t.truthy(accepted);
  t.deepEqual(
    accepted!.outputs.map(output => [output.bitrate, output.fps]),
    [
      [6000, 60],
      [6000, 60],
    ],
  );
  t.deepEqual(accepted!.outputs[0].probes, []);
  t.is(accepted!.outputs[0].measurement, 'estimated');
  for (const mutation of [
    (result: IAutoOptimizerNativeResult) => {
      result.outputs[1].measurement.evidence = [];
    },
    (result: IAutoOptimizerNativeResult) => {
      result.outputs[0].measurement.mode = 'active';
    },
    (result: IAutoOptimizerNativeResult) => {
      result.outputs[0].encoding!.bitrateKbps = 7000;
    },
    (result: IAutoOptimizerNativeResult) => {
      result.outputs[1].videos[0].fpsNum = 30;
    },
  ]) {
    const invalid = copy(native);
    mutation(invalid);
    t.is(acceptAutoOptimizerResult(invalid, context), null);
  }
});

test('incomplete, missing, extra, and duplicate OSN outputs are rejected', t => {
  const context = standardAttempt();
  const partial = standardNativeResult();
  partial.status = 'partial';
  t.is(acceptAutoOptimizerResult(partial, context), null);

  const contradictoryError = standardNativeResult();
  contradictoryError.error = { code: 'cancelled' };
  t.is(acceptAutoOptimizerResult(contradictoryError, context), null);

  const missing = standardNativeResult();
  missing.outputs = [];
  t.is(acceptAutoOptimizerResult(missing, context), null);

  const extra = standardNativeResult();
  extra.outputs.push({ ...copy(extra.outputs[0]), outputId: 'unexpected' });
  t.is(acceptAutoOptimizerResult(extra, context), null);

  const duplicate = standardNativeResult();
  duplicate.outputs.push(copy(duplicate.outputs[0]));
  t.is(acceptAutoOptimizerResult(duplicate, context), null);
});

test('saved request outputs, destinations, and exact video display sets are enforced', t => {
  const mismatchedId = standardAttempt();
  mismatchedId.outputs[0].outputId = 'other';
  t.is(acceptAutoOptimizerResult(standardNativeResult(), mismatchedId), null);

  const mismatchedDestinations = standardAttempt();
  mismatchedDestinations.outputs[0].destinations = ['youtube'];
  t.is(acceptAutoOptimizerResult(standardNativeResult(), mismatchedDestinations), null);

  const wrongDisplay = standardNativeResult();
  wrongDisplay.outputs[0].videos[0].display = 'vertical';
  t.is(acceptAutoOptimizerResult(wrongDisplay, standardAttempt()), null);

  const duplicateDisplay = standardNativeResult();
  duplicateDisplay.outputs[0].videos.push(copy(duplicateDisplay.outputs[0].videos[0]));
  t.is(acceptAutoOptimizerResult(duplicateDisplay, standardAttempt()), null);
});

test('standard results require encoding settings while Twitch-managed results omit them', t => {
  const standardWithoutEncoding = standardNativeResult();
  delete standardWithoutEncoding.outputs[0].encoding;
  t.is(acceptAutoOptimizerResult(standardWithoutEncoding, standardAttempt()), null);

  const twitchManagedContext = standardAttempt();
  twitchManagedContext.streamSetup.type = 'enhanced-broadcasting';
  twitchManagedContext.streamSetup.outputs[0] = {
    ...twitchManagedContext.streamSetup.outputs[0],
    outputKind: 'twitch-enhanced-broadcasting',
    probeCandidates: [],
    measurement: 'estimated',
    estimateReason: 'enhanced_broadcasting',
  };
  twitchManagedContext.outputs[0] = {
    ...twitchManagedContext.outputs[0],
    outputKind: 'twitch-enhanced-broadcasting',
    estimateReason: 'enhanced_broadcasting',
  };
  const twitchManagedResult = standardNativeResult();
  twitchManagedResult.outputs[0].videos[0] = {
    display: 'horizontal',
    width: 1280,
    height: 720,
    fpsNum: 30,
    fpsDen: 1,
  };
  twitchManagedResult.outputs[0].measurement = {
    mode: 'estimated',
    confidence: 'medium',
    reason: 'enhanced_broadcasting',
  };
  delete twitchManagedResult.outputs[0].encoding;
  const accepted = acceptAutoOptimizerResult(twitchManagedResult, twitchManagedContext);
  t.truthy(accepted);
  t.false('encoder' in accepted!.outputs[0]);

  twitchManagedResult.outputs[0].encoding = standardNativeResult().outputs[0].encoding;
  t.is(acceptAutoOptimizerResult(twitchManagedResult, twitchManagedContext), null);
});

test('measured Enhanced Broadcasting fallback explanations survive result acceptance', t => {
  const context = standardAttempt();
  context.streamSetup.type = 'enhanced-broadcasting';
  context.streamSetup.outputs[0].outputKind = 'twitch-enhanced-broadcasting';
  context.streamSetup.outputs[0].probeCandidates[0].kind = 'twitch-enhanced-broadcasting';
  context.outputs[0].outputKind = 'twitch-enhanced-broadcasting';
  const nativeResult = standardNativeResult();
  delete nativeResult.outputs[0].encoding;
  nativeResult.outputs[0].measurement.evidence![0].method = 'twitch-enhanced-broadcasting-test';

  for (const reason of [
    'enhanced_broadcasting_transport_fallback',
    'enhanced_broadcasting_workload_fallback',
    'enhanced_broadcasting_transport_and_workload_fallback',
  ]) {
    nativeResult.outputs[0].measurement.reason = reason;
    const accepted = acceptAutoOptimizerResult(nativeResult, context);
    t.truthy(accepted);
    t.is(accepted!.outputs[0].estimateReason, reason);
    t.is(accepted!.outputs[0].measurement, 'active');
    t.is(accepted!.outputs[0].confidence, 'high');
    t.false('encoder' in accepted!.outputs[0]);
  }
});

test('probe evidence and limits must match the saved request context', t => {
  const wrongEvidence = standardNativeResult();
  wrongEvidence.outputs[0].measurement.evidence = [
    {
      platform: 'youtube',
      method: 'youtube-unbound-ramp',
      success: true,
    },
  ];
  t.is(acceptAutoOptimizerResult(wrongEvidence, standardAttempt()), null);

  const constrained = standardAttempt();
  constrained.outputs[0].limits!.maxBitrateKbps = 5000;
  t.is(acceptAutoOptimizerResult(standardNativeResult(), constrained), null);

  const estimatedPromotion = standardNativeResult();
  estimatedPromotion.outputs[0].measurement = {
    mode: 'estimated',
    confidence: 'low',
    reason: 'probe_disabled',
  };
  t.is(acceptAutoOptimizerResult(estimatedPromotion, standardAttempt()), null);
});
