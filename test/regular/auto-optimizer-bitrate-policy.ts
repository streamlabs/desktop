import test from 'ava';
import {
  AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS,
  autoOptimizerRecommendationBitrateCap,
} from '../../app/services/auto-config/bitrate-policy';

test('standard Auto Optimizer outputs share one absolute recommendation ceiling', t => {
  t.is(AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS, 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['youtube']), 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['custom']), 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['youtube', 'kick']), 8000);
  t.is(autoOptimizerRecommendationBitrateCap('standard', ['youtube', 'tiktok']), 6000);
});

test('provider-owned Enhanced Broadcasting ladders are not given a Desktop bitrate cap', t => {
  t.is(
    autoOptimizerRecommendationBitrateCap('twitch-enhanced-broadcasting', ['twitch']),
    undefined,
  );
});
