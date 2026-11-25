import test from 'ava';
import {
  autoOptimizerContentSupports1440p,
  IAutoOptimizerContentItem,
} from '../../app/services/auto-optimizer/content-resolution';

const fullHdMonitor = { size: { width: 1920, height: 1080 }, scaleFactor: 1 };
const ultraHdMonitor = { size: { width: 3840, height: 2160 }, scaleFactor: 1 };
const noNestedItems = (): IAutoOptimizerContentItem[] => [];
const capture = (patch: Partial<IAutoOptimizerContentItem> = {}): IAutoOptimizerContentItem => ({
  sourceId: 'capture',
  type: 'game_capture',
  width: 1920,
  height: 1080,
  visible: true,
  ...patch,
});

test('1080p capture does not qualify for 1440p even with a higher-resolution monitor', t => {
  t.false(autoOptimizerContentSupports1440p([capture()], noNestedItems, [fullHdMonitor]));
  t.false(autoOptimizerContentSupports1440p([capture()], noNestedItems, [ultraHdMonitor]));
});

test('native 1440p and 4K content qualify even when the app runs on a 1080p monitor', t => {
  for (const type of ['monitor_capture', 'game_capture', 'dshow_input', 'ffmpeg_source']) {
    for (const [width, height] of [
      [2560, 1440],
      [3840, 2160],
    ]) {
      t.true(
        autoOptimizerContentSupports1440p([capture({ type, width, height })], noNestedItems, [
          fullHdMonitor,
        ]),
      );
    }
  }
});

test('large decorative sources and nested scene dimensions are not capture evidence', t => {
  for (const type of ['browser_source', 'image_source', 'color_source', 'text_gdiplus', 'scene']) {
    t.false(
      autoOptimizerContentSupports1440p(
        [capture({ type, width: 3840, height: 2160 })],
        noNestedItems,
        [fullHdMonitor],
      ),
    );
  }
});

test('hidden, recording-only and vertical content cannot unlock horizontal 1440p', t => {
  for (const patch of [
    { visible: false },
    { streamVisible: false },
    { forceHidden: true },
    { display: 'vertical' as const },
  ]) {
    t.false(
      autoOptimizerContentSupports1440p(
        [capture({ width: 3840, height: 2160, ...patch })],
        noNestedItems,
        [fullHdMonitor],
      ),
    );
  }
});

test('visible nested captures qualify but a hidden ancestor excludes them', t => {
  const nested = () => [capture({ width: 2560, height: 1440 })];
  const scene = capture({ sourceId: 'nested', type: 'scene' });
  t.true(autoOptimizerContentSupports1440p([scene], nested, [fullHdMonitor]));
  t.false(
    autoOptimizerContentSupports1440p([{ ...scene, visible: false }], nested, [fullHdMonitor]),
  );
  t.false(
    autoOptimizerContentSupports1440p([{ ...scene, streamVisible: false }], nested, [
      fullHdMonitor,
    ]),
  );
});

test('nested-scene cycles terminate without treating the canvas as captured content', t => {
  const scene = capture({ type: 'scene', width: 3840, height: 2160 });
  let visits = 0;
  t.false(
    autoOptimizerContentSupports1440p(
      [scene],
      () => {
        visits++;
        return [scene];
      },
      [fullHdMonitor],
    ),
  );
  t.is(visits, 1);
});

test('cropping uses the remaining source pixels, not its enlarged scene transform', t => {
  t.false(
    autoOptimizerContentSupports1440p(
      [
        capture({
          width: 2560,
          height: 1440,
          transform: { crop: { left: 320, right: 320, top: 180, bottom: 180 } },
        }),
      ],
      noNestedItems,
      [ultraHdMonitor],
    ),
  );
  t.true(
    autoOptimizerContentSupports1440p(
      [
        capture({
          width: 3840,
          height: 2160,
          transform: { crop: { left: 640, right: 640, top: 360, bottom: 360 } },
        }),
      ],
      noNestedItems,
      [fullHdMonitor],
    ),
  );
});

test('unknown content falls back to physical pixels across connected monitors', t => {
  t.false(autoOptimizerContentSupports1440p([], noNestedItems, [fullHdMonitor]));
  t.true(autoOptimizerContentSupports1440p([], noNestedItems, [fullHdMonitor, ultraHdMonitor]));
  t.true(
    autoOptimizerContentSupports1440p([], noNestedItems, [
      { size: { width: 1280, height: 720 }, scaleFactor: 2 },
    ]),
  );
  t.false(
    autoOptimizerContentSupports1440p([], noNestedItems, [
      { size: { width: 1536, height: 864 }, scaleFactor: 1.25 },
    ]),
  );
  t.false(
    autoOptimizerContentSupports1440p([], noNestedItems, [
      { size: { width: 1440, height: 2560 }, scaleFactor: 1 },
    ]),
  );
});

test('unavailable capture dimensions use the monitor fallback; missing evidence stays at 1080p', t => {
  for (const width of [0, -1, NaN, Infinity]) {
    t.false(
      autoOptimizerContentSupports1440p([capture({ width })], noNestedItems, [fullHdMonitor]),
    );
    t.true(
      autoOptimizerContentSupports1440p([capture({ width })], noNestedItems, [ultraHdMonitor]),
    );
  }
  t.false(autoOptimizerContentSupports1440p([], noNestedItems, []));
  t.false(
    autoOptimizerContentSupports1440p([], noNestedItems, [{ ...ultraHdMonitor, scaleFactor: NaN }]),
  );
});
