import { TClip } from 'services/highlighter/models/highlighter.models';

/** The editor panel only makes sense once there is more than one clip to put together */
export const MIN_SELECTED_CLIPS_FOR_EDITOR = 2;

export function sortClipsByOrder(clips: TClip[]): TClip[] {
  return clips
    .filter(c => c.deleted !== true)
    .sort((a: TClip, b: TClip) => a.globalOrderPosition - b.globalOrderPosition);
}

export function getCombinedClipsDuration(clips: TClip[]): number {
  return clips.reduce(
    (sum, clip) => sum + (clip.duration ? clip.duration - (clip.startTrim + clip.endTrim) : 0),
    0,
  );
}
