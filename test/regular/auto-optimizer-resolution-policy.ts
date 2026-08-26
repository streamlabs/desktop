import test from 'ava';
import {
  autoOptimizerAcceptedBaseResolution,
  autoOptimizerCanvasAllowsQualityPromotion,
  autoOptimizerDisplayFrameRate,
  autoOptimizerHardwareCeilings,
  autoOptimizerPromotesResolution,
  autoOptimizerResolutionCeiling,
  autoOptimizerRequestFrameRateCeiling,
  buildAutoOptimizerRequestLimits,
  matchesAutoOptimizerQualityPolicy,
  selectAutoOptimizerQuality,
} from '../../app/services/auto-config/resolution-policy';

test('active landscape request permits disposable testing through the highest V1 tier', t => {
  t.deepEqual(
    buildAutoOptimizerRequestLimits({
      allowPromotion: true,
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
      currentWidth: 720,
      currentHeight: 1280,
      currentFpsNum: 30,
      currentFpsDen: 1,
    }),
    {
      maxWidth: 1080,
      maxHeight: 1920,
      maxFpsNum: 60,
      maxFpsDen: 1,
    },
  );
});

test('active request promotes only the supported 30 FPS cadence families', t => {
  t.deepEqual(autoOptimizerRequestFrameRateCeiling(true, 1920, 1080, 30, 1), {
    fpsNum: 60,
    fpsDen: 1,
  });
  t.deepEqual(autoOptimizerRequestFrameRateCeiling(true, 1920, 1080, 30000, 1001), {
    fpsNum: 60000,
    fpsDen: 1001,
  });
  t.deepEqual(autoOptimizerRequestFrameRateCeiling(true, 1920, 1080, 25, 1), {
    fpsNum: 25,
    fpsDen: 1,
  });
});

test('estimate-only and custom-aspect requests preserve the exact current cadence', t => {
  t.deepEqual(autoOptimizerRequestFrameRateCeiling(false, 1920, 1080, 30, 1), {
    fpsNum: 30,
    fpsDen: 1,
  });
  t.deepEqual(autoOptimizerRequestFrameRateCeiling(true, 1280, 800, 30, 1), {
    fpsNum: 30,
    fpsDen: 1,
  });
});

test('public frame rate is rounded while the recommendation keeps its exact rational', t => {
  t.is(autoOptimizerDisplayFrameRate(60000, 1001), 59.94);
});

test('estimate-only request retains an exact high current output without applying the V1 cap', t => {
  t.deepEqual(
    buildAutoOptimizerRequestLimits({
      allowPromotion: false,
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

test('active request can test above a smaller authored canvas without mutating it', t => {
  t.deepEqual(autoOptimizerResolutionCeiling(960, 540), {
    width: 1920,
    height: 1080,
  });
});

test('quality promotion requires a canonical Base Canvas with matching orientation', t => {
  t.true(autoOptimizerCanvasAllowsQualityPromotion(1280, 720, 960, 540));
  t.true(autoOptimizerCanvasAllowsQualityPromotion(720, 1280, 540, 960));
  t.false(autoOptimizerCanvasAllowsQualityPromotion(1600, 1200, 1280, 720));
  t.false(autoOptimizerCanvasAllowsQualityPromotion(1280, 720, 720, 1280));
});

test('Base Canvas growth follows output-tier promotion, not an existing upscale', t => {
  t.true(autoOptimizerPromotesResolution(1280, 720, 1920, 1080));
  t.false(autoOptimizerPromotesResolution(1920, 1080, 1920, 1080));
  t.false(autoOptimizerPromotesResolution(1920, 1080, 1280, 720));
});

test('non-16:9 and non-9:16 outputs are not promoted', t => {
  t.deepEqual(autoOptimizerResolutionCeiling(1280, 800), {
    width: 1280,
    height: 800,
  });
});

test('accepted promotion grows Base Canvas without shrinking authored dimensions', t => {
  t.deepEqual(autoOptimizerAcceptedBaseResolution(1280, 720, 1920, 1080), {
    width: 1920,
    height: 1080,
  });
  t.deepEqual(autoOptimizerAcceptedBaseResolution(1600, 1200, 1920, 1080), {
    width: 1920,
    height: 1440,
  });
  t.deepEqual(autoOptimizerAcceptedBaseResolution(2560, 1440, 1920, 1080), {
    width: 2560,
    height: 1440,
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

test('active 30 FPS request exposes tested 60 and 30 FPS quality rungs', t => {
  t.deepEqual(
    autoOptimizerHardwareCeilings(
      { width: 1280, height: 720, fpsNum: 30, fpsDen: 1 },
      {
        maxWidth: 1920,
        maxHeight: 1080,
        maxFpsNum: 60,
        maxFpsDen: 1,
      },
    ),
    [
      { width: 1920, height: 1080, fpsNum: 60, fpsDen: 1 },
      { width: 1920, height: 1080, fpsNum: 30, fpsDen: 1 },
      { width: 1280, height: 720, fpsNum: 60, fpsDen: 1 },
      { width: 1280, height: 720, fpsNum: 30, fpsDen: 1 },
      { width: 960, height: 540, fpsNum: 60, fpsDen: 1 },
      { width: 960, height: 540, fpsNum: 30, fpsDen: 1 },
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
