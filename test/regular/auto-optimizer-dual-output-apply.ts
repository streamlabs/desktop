import test from 'ava';
import {
  buildAutoOptimizerVideoSettingsPatches,
  shouldApplyAutoOptimizerVideoSettings,
} from '../../app/services/auto-config/output-transaction-policy';
import {
  isValidAutoConfigDualOutputResultEnvelope,
  validateAutoConfigRecommendation,
} from '../../app/services/auto-config/result-policy';
import { IAutoConfigNativeResult } from '../../app/services/auto-config/types';

type TRecommendation = IAutoConfigNativeResult['legs'][number]['recommendation'];

const encoder = {
  encoderId: 'obs_nvenc_h264_tex',
  encoderFamily: 'obs_nvenc_h264_tex' as const,
  encoderTitle: 'NVIDIA NVENC H.264',
  codec: 'h264' as const,
  preset: 'p5',
};

function recommendation(
  width: number,
  height: number,
  patch: Partial<TRecommendation> = {},
): TRecommendation {
  return {
    width,
    height,
    fpsNum: 60,
    fpsDen: 1,
    bitrateKbps: 5800,
    ...encoder,
    ...patch,
  };
}

function activeDualOutputResult(): IAutoConfigNativeResult {
  return {
    schemaVersion: 1,
    sessionId: 'active-dual-output',
    status: 'complete',
    aggregateUpload: {
      method: 'dual-output-isolated-lower-bound',
      safeVideoKbps: 11600,
      allocatedVideoKbps: 11600,
      concurrentHardwareValidated: true,
    },
    legs: [
      {
        legId: 'horizontal',
        display: 'horizontal',
        destinations: [{ platform: 'twitch' }],
        measurement: {
          mode: 'active',
          confidence: 'high',
          probes: [
            {
              provider: 'twitch',
              method: 'twitch-bandwidth-test',
              measuredKbps: 6013,
              safeKbps: 6000,
              headroomPercent: 0,
              success: true,
            },
          ],
        },
        recommendation: recommendation(1920, 1080),
      },
      {
        legId: 'vertical',
        display: 'vertical',
        destinations: [{ platform: 'youtube' }],
        measurement: {
          mode: 'active',
          confidence: 'high',
          probes: [
            {
              provider: 'youtube',
              method: 'youtube-unbound-ramp',
              measuredKbps: 11620,
              safeKbps: 11600,
              headroomPercent: 0,
              success: true,
            },
          ],
        },
        recommendation: recommendation(1080, 1920),
      },
    ],
  };
}

const currentVideo = {
  horizontal: {
    baseWidth: 1280,
    baseHeight: 720,
    outputWidth: 1280,
    outputHeight: 720,
    fpsNum: 30,
    fpsDen: 1,
  },
  vertical: {
    baseWidth: 720,
    baseHeight: 1280,
    outputWidth: 720,
    outputHeight: 1280,
    fpsNum: 30,
    fpsDen: 1,
  },
};

test('a proven Twitch and YouTube pair produces one atomic two-canvas video transaction', t => {
  const result = activeDualOutputResult();
  t.true(isValidAutoConfigDualOutputResultEnvelope(result, ['horizontal', 'vertical']));
  t.true(
    shouldApplyAutoOptimizerVideoSettings(
      'dual-output',
      false,
      result.legs.map(leg => leg.measurement.mode),
    ),
  );

  const recommendations = result.legs.map(leg => leg.recommendation!);
  t.true(
    recommendations.every(
      value =>
        value.bitrateKbps === recommendations[0].bitrateKbps &&
        value.encoderId === recommendations[0].encoderId &&
        value.encoderFamily === recommendations[0].encoderFamily &&
        value.preset === recommendations[0].preset,
    ),
  );

  const patches = buildAutoOptimizerVideoSettingsPatches(
    result.legs.map(leg => ({
      display: leg.display,
      resolution: {
        width: leg.recommendation!.width,
        height: leg.recommendation!.height,
      },
    })),
    currentVideo,
    recommendations[0].fpsNum,
    recommendations[0].fpsDen,
  );

  t.deepEqual(patches, {
    horizontal: {
      baseWidth: 1920,
      baseHeight: 1080,
      outputWidth: 1920,
      outputHeight: 1080,
      fpsNum: 60,
      fpsDen: 1,
    },
    vertical: {
      baseWidth: 1080,
      baseHeight: 1920,
      outputWidth: 1080,
      outputHeight: 1920,
      fpsNum: 60,
      fpsDen: 1,
    },
  });
});

test('a fully estimated two-leg fallback cannot promote either canvas or shared FPS', t => {
  const result = activeDualOutputResult();
  delete result.aggregateUpload;
  result.legs.forEach(leg => {
    leg.measurement.mode = 'estimated';
    leg.measurement.confidence = 'low';
  });
  t.true(isValidAutoConfigDualOutputResultEnvelope(result, ['horizontal', 'vertical']));

  const horizontal = validateAutoConfigRecommendation(result.legs[0].recommendation, {
    measurementMode: 'estimated',
    currentBitrateKbps: 2500,
    probeEvidence: [],
    maxWidth: 1920,
    maxHeight: 1080,
    maxFpsNum: 60,
    maxFpsDen: 1,
    currentWidth: 1280,
    currentHeight: 720,
    currentFpsNum: 30,
    currentFpsDen: 1,
  });
  const vertical = validateAutoConfigRecommendation(result.legs[1].recommendation, {
    measurementMode: 'estimated',
    currentBitrateKbps: 2500,
    probeEvidence: [],
    maxWidth: 1080,
    maxHeight: 1920,
    maxFpsNum: 60,
    maxFpsDen: 1,
    currentWidth: 720,
    currentHeight: 1280,
    currentFpsNum: 30,
    currentFpsDen: 1,
  });

  t.is(horizontal, null);
  t.is(vertical, null);
});
