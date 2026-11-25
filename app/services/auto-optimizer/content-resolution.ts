import { streamResolutionCeiling } from '../streaming/stream-resolution-policy';

/** Native source dimensions, before scene-item scaling or canvas enlargement. */
export interface IAutoOptimizerContentItem {
  sourceId: string;
  type: string;
  width: number;
  height: number;
  visible: boolean;
  streamVisible?: boolean;
  forceHidden?: boolean;
  display?: 'horizontal' | 'vertical';
  transform?: { crop: { left: number; right: number; top: number; bottom: number } };
}

export interface IAutoOptimizerMonitor {
  size: { width: number; height: number };
  scaleFactor: number;
}

// Browser, image, text and color sources commonly belong to an overlay. Their
// configured size (like a larger canvas) is not evidence of higher-resolution capture.
const CONTENT_SOURCE_TYPES = new Set([
  'monitor_capture',
  'display_capture',
  'screen_capture',
  'mac_screen_capture',
  'window_capture',
  'game_capture',
  'dshow_input',
  'av_capture_input',
  'macos_avcapture',
  'decklink-input',
  'ndi_source',
  'spout_capture',
  'syphon-input',
  'openvr_capture',
  'liv_capture',
  'mediasoupconnector',
  'ffmpeg_source',
  'vlc_source',
]);

/**
 * Prefer visible horizontal capture/video content over monitor capabilities.
 * If no source reports a usable size yet (for example, a game has not hooked),
 * use physical monitor pixels, not DPI-scaled desktop coordinates. Never infer
 * content detail from Base (Canvas) or Output (Scaled) Resolution.
 */
export function autoOptimizerContentSupports1440p(
  items: readonly IAutoOptimizerContentItem[],
  getSceneItems: (sceneId: string) => readonly IAutoOptimizerContentItem[],
  monitors: readonly IAutoOptimizerMonitor[],
): boolean {
  const target = streamResolutionCeiling(true);
  const captures: { width: number; height: number }[] = [];
  const visited = new Set<string>();
  const validSize = (width: number, height: number) =>
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const supports1440p = ({ width, height }: { width: number; height: number }) =>
    validSize(width, height) && width >= target.width && height >= target.height;

  function collect(sceneItems: readonly IAutoOptimizerContentItem[]) {
    for (const item of sceneItems) {
      if (
        !item.visible ||
        item.streamVisible === false ||
        item.forceHidden ||
        item.display === 'vertical'
      ) {
        continue;
      }
      if (item.type === 'scene') {
        if (!visited.has(item.sourceId)) {
          visited.add(item.sourceId);
          collect(getSceneItems(item.sourceId));
        }
      } else if (CONTENT_SOURCE_TYPES.has(item.type) && validSize(item.width, item.height)) {
        const crop = item.transform?.crop;
        captures.push({
          width: item.width - (crop?.left || 0) - (crop?.right || 0),
          height: item.height - (crop?.top || 0) - (crop?.bottom || 0),
        });
      }
    }
  }

  collect(items);
  if (captures.length) return captures.some(supports1440p);
  return monitors.some(
    monitor =>
      Number.isFinite(monitor.scaleFactor) &&
      monitor.scaleFactor > 0 &&
      supports1440p({
        width: monitor.size.width * monitor.scaleFactor,
        height: monitor.size.height * monitor.scaleFactor,
      }),
  );
}
