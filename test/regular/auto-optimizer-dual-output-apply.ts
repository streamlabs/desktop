import test from 'ava';
import {
  buildAutoOptimizerVideoSettingsPatches,
  shouldApplyAutoOptimizerVideoSettings,
} from '../../app/services/auto-config/output-transaction-policy';
import {
  IAutoConfigRecommendationCandidate,
  validateAutoConfigRecommendation,
} from '../../app/services/auto-config/result-policy';

type TRecommendation = IAutoConfigRecommendationCandidate;

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

function activeDualOutputResult() {
  return {
    outputs: [
      {
        display: 'horizontal' as const,
        measurement: 'active' as 'active' | 'estimated',
        recommendation: recommendation(1920, 1080, { bitrateKbps: 5000 }),
      },
      {
        display: 'vertical' as const,
        measurement: 'active' as 'active' | 'estimated',
        recommendation: recommendation(1080, 1920, { bitrateKbps: 5000 }),
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
  t.true(
    shouldApplyAutoOptimizerVideoSettings(
      'dual-output',
      false,
      result.outputs.map(output => output.measurement),
    ),
  );

  const recommendations = result.outputs.map(output => output.recommendation!);
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
    result.outputs.map(output => ({
      display: output.display,
      resolution: {
        width: output.recommendation!.width,
        height: output.recommendation!.height,
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

test('a fully estimated two-output fallback cannot promote either canvas or shared FPS', t => {
  const result = activeDualOutputResult();
  result.outputs.forEach(output => {
    output.measurement = 'estimated';
  });

  const horizontal = validateAutoConfigRecommendation(result.outputs[0].recommendation, {
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
  const vertical = validateAutoConfigRecommendation(result.outputs[1].recommendation, {
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
