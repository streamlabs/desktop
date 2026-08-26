import test from 'ava';
import {
  autoOptimizerHardwareCeilings,
  autoOptimizerResolutionCeiling,
  buildAutoOptimizerRequestLimits,
  matchesAutoOptimizerQualityPolicy,
  selectAutoOptimizerQuality,
} from '../../app/services/auto-config/resolution-policy';

test('active landscape request permits promotion to the highest canvas-bounded V1 tier', t => {
  t.deepEqual(
    buildAutoOptimizerRequestLimits({
      allowPromotion: true,
      baseWidth: 1920,
      baseHeight: 1080,
      currentWidth: 1280,
      currentHeight: 720,
      currentFpsNum: 60,
      currentFpsDen: 1,
      maxBitrateKbps: 6000,
    }),
    {
      maxBitrateKbps: 6000,
      maxWidth: 1920,
      maxHeight: 1080,
      maxFpsNum: 60,
      maxFpsDen: 1,
    },
  );
});

test('active portrait request uses portrait V1 tiers', t => {
  t.deepEqual(
    buildAutoOptimizerRequestLimits({
      allowPromotion: true,
      baseWidth: 1080,
      baseHeight: 1920,
      currentWidth: 720,
      currentHeight: 1280,
      currentFpsNum: 30,
      currentFpsDen: 1,
    }),
    {
      maxWidth: 1080,
      maxHeight: 1920,
      maxFpsNum: 30,
      maxFpsDen: 1,
    },
  );
});

test('estimate-only request retains an exact high current output without applying the V1 cap', t => {
  t.deepEqual(
    buildAutoOptimizerRequestLimits({
      allowPromotion: false,
      baseWidth: 3840,
      baseHeight: 2160,
      currentWidth: 2560,
      currentHeight: 1440,
      currentFpsNum: 60000,
      currentFpsDen: 1001,
    }),
    {
      maxWidth: 2560,
      maxHeight: 1440,
      maxFpsNum: 60000,
      maxFpsDen: 1001,
    },
  );
});

test('active request never promotes beyond a smaller authored canvas', t => {
  t.deepEqual(autoOptimizerResolutionCeiling(1280, 720, 960, 540), {
    width: 1280,
    height: 720,
  });
});

test('non-16:9 and non-9:16 outputs are not promoted', t => {
  t.deepEqual(autoOptimizerResolutionCeiling(1920, 1200, 1280, 800), {
    width: 1280,
    height: 800,
  });
});

test('hardware ceilings contain only exact V1 tiers and broadcast-rate variants', t => {
  t.deepEqual(
    autoOptimizerHardwareCeilings(
      { width: 1280, height: 720, fpsNum: 60000, fpsDen: 1001 },
      {
        maxWidth: 1920,
        maxHeight: 1080,
        maxFpsNum: 60000,
        maxFpsDen: 1001,
      },
    ),
    [
      { width: 1920, height: 1080, fpsNum: 60000, fpsDen: 1001 },
      { width: 1920, height: 1080, fpsNum: 30000, fpsDen: 1001 },
      { width: 1280, height: 720, fpsNum: 60000, fpsDen: 1001 },
      { width: 1280, height: 720, fpsNum: 30000, fpsDen: 1001 },
      { width: 960, height: 540, fpsNum: 60000, fpsDen: 1001 },
      { width: 960, height: 540, fpsNum: 30000, fpsDen: 1001 },
    ],
  );
});

test('quality selection mirrors high-FPS preference and insufficient-bandwidth fallback', t => {
  const ceiling = { width: 1920, height: 1080, fpsNum: 60, fpsDen: 1 };
  t.deepEqual(selectAutoOptimizerQuality(ceiling, 4000, 'x264'), {
    width: 1280,
    height: 720,
    fpsNum: 60,
    fpsDen: 1,
  });
  t.deepEqual(selectAutoOptimizerQuality(ceiling, 1, 'x264'), {
    width: 960,
    height: 540,
    fpsNum: 30,
    fpsDen: 1,
  });
});

test('result must be selectable from a tested ceiling at the returned safe bitrate', t => {
  const current = { width: 1280, height: 720, fpsNum: 60, fpsDen: 1 };
  const limits = {
    maxWidth: 1920,
    maxHeight: 1080,
    maxFpsNum: 60,
    maxFpsDen: 1,
  };
  t.true(
    matchesAutoOptimizerQualityPolicy(
      { width: 1280, height: 720, fpsNum: 60, fpsDen: 1 },
      current,
      limits,
      4000,
      'x264',
    ),
  );
  t.false(
    matchesAutoOptimizerQualityPolicy(
      { width: 1920, height: 1080, fpsNum: 60, fpsDen: 1 },
      current,
      limits,
      4000,
      'x264',
    ),
  );
  t.true(
    matchesAutoOptimizerQualityPolicy(
      { width: 960, height: 540, fpsNum: 30, fpsDen: 1 },
      current,
      limits,
      1,
      'x264',
    ),
  );
});
