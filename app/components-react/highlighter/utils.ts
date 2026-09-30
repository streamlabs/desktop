import { TClip } from 'services/highlighter/models/highlighter.models';
import { useRef, useEffect, useCallback } from 'react';
import styles from './ClipsView.m.less';

/** The editor panel only makes sense once there is more than one clip to put together */
export const MIN_SELECTED_CLIPS_FOR_EDITOR = 2;

export function sortClipsByOrder(clips: TClip[]): TClip[] {
  return clips
    .filter(c => c.deleted !== true)
    .sort((a: TClip, b: TClip) => a.globalOrderPosition - b.globalOrderPosition);
}

export const useOptimizedHover = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHoveredId = useRef<string | null>(null);

  const handleHover = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const clipElement = target.closest('[data-clip-id]');
    const clipId = clipElement?.getAttribute('data-clip-id');

    if (clipId === lastHoveredId.current) return; // Exit if hovering over the same element

    if (lastHoveredId.current) {
      // Remove highlight from previously hovered elements
      document
        .querySelectorAll(`[data-clip-id="${lastHoveredId.current}"]`)
        .forEach(el => el instanceof HTMLElement && el.classList.remove(styles.highlighted));
    }

    if (clipId) {
      // Add highlight to newly hovered elements
      document
        .querySelectorAll(`[data-clip-id="${clipId}"]`)
        .forEach(el => el instanceof HTMLElement && el.classList.add(styles.highlighted));
      lastHoveredId.current = clipId;
    } else {
      lastHoveredId.current = null;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleHover, { passive: true });
      container.addEventListener('mouseleave', handleHover, { passive: true });

      return () => {
        container.removeEventListener('mousemove', handleHover);
        container.removeEventListener('mouseleave', handleHover);
      };
    }
  }, [handleHover]);

  return containerRef;
};

export function getCombinedClipsDuration(clips: TClip[]): number {
  return clips.reduce(
    (sum, clip) => sum + (clip.duration ? clip.duration - (clip.startTrim + clip.endTrim) : 0),
    0,
  );
}
