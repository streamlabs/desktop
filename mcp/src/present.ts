/**
 * The scene as the MODEL should see it.
 *
 * Two server-side implementation details would otherwise leak into every item list (a hidden
 * 0x0 camera copy to resize by mistake; a frame that takes four remove_item calls to remove):
 *
 *   - set_camera keeps one source per camera and swaps visibility, so a scene can hold a hidden
 *     "Webcam" next to the live "Webcam (NVIDIA Broadcast)". Only the live one is shown.
 *   - The webcam frame is four color strips. They are shown as one "Webcam frame" entry.
 */

export const FRAME_STRIP_RE = / Webcam Frame (Top|Bottom|Left|Right)$/;
export const FRAME_ITEM_NAME = 'Webcam frame';

/** "Webcam frame", "the webcam border", "frame" -- the logical frame, not a strip. */
export function isFrameRequest(name: string): boolean {
  return /^(the\s+)?(webcam\s+|camera\s+)?(frame|border)s?$/i.test(name.trim());
}

type Rect4 = [number, number, number, number];

export interface PresentableItem {
  name: string;
  type: string;
  visible: boolean;
  rect: Rect4;
}

export function presentForModel<T extends PresentableItem>(items: T[]): T[] {
  const liveCam = items.some(i => i.type === 'dshow_input' && i.visible);
  const strips = items.filter(i => FRAME_STRIP_RE.test(i.name));

  const out: T[] = [];
  let frameAdded = false;
  let offCamShown = false;

  for (const i of items) {
    if (FRAME_STRIP_RE.test(i.name)) {
      if (!frameAdded) {
        frameAdded = true;
        const xs = strips.map(s => s.rect[0]);
        const ys = strips.map(s => s.rect[1]);
        const x2 = strips.map(s => s.rect[0] + s.rect[2]);
        const y2 = strips.map(s => s.rect[1] + s.rect[3]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        out.push({
          ...i,
          name: FRAME_ITEM_NAME,
          type: 'webcam_frame',
          visible: strips.some(s => s.visible),
          rect: [x, y, Math.max(...x2) - x, Math.max(...y2) - y],
        });
      }
      continue;
    }
    if (i.type === 'dshow_input') {
      // With a live camera, hide the inactive copies. With the webcam "off", show one entry.
      if (liveCam ? !i.visible : offCamShown) continue;
      if (!liveCam) offCamShown = true;
    }
    out.push(i);
  }
  return out;
}
