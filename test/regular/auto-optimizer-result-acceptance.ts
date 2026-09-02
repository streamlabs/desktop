import test from 'ava';
import {
  acceptAutoOptimizerResult,
  IAutoConfigAttemptContext,
} from '../../app/services/auto-config/result-acceptance';
import { IAutoConfigNativeResult } from '../../app/services/auto-config/types';

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function standardAttempt(): IAutoConfigAttemptContext {
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
              provider: 'twitch',
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

function standardNativeResult(): IAutoConfigNativeResult {
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

  const providerContext = standardAttempt();
  providerContext.streamSetup.type = 'enhanced-broadcasting';
  providerContext.streamSetup.outputs[0] = {
    ...providerContext.streamSetup.outputs[0],
    outputKind: 'twitch-enhanced-broadcasting',
    probeCandidates: [],
    measurement: 'estimated',
    estimateReason: 'enhanced_broadcasting',
  };
  providerContext.outputs[0] = {
    ...providerContext.outputs[0],
    outputKind: 'twitch-enhanced-broadcasting',
    estimateReason: 'enhanced_broadcasting',
  };
  const providerResult = standardNativeResult();
  providerResult.outputs[0].videos[0] = {
    display: 'horizontal',
    width: 1280,
    height: 720,
    fpsNum: 30,
    fpsDen: 1,
  };
  providerResult.outputs[0].measurement = {
    mode: 'estimated',
    confidence: 'medium',
    reason: 'enhanced_broadcasting',
  };
  delete providerResult.outputs[0].encoding;
  const accepted = acceptAutoOptimizerResult(providerResult, providerContext);
  t.truthy(accepted);
  t.false('encoder' in accepted!.outputs[0]);

  providerResult.outputs[0].encoding = standardNativeResult().outputs[0].encoding;
  t.is(acceptAutoOptimizerResult(providerResult, providerContext), null);
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
