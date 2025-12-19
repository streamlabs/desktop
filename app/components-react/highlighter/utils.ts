import moment from 'moment';
import { IAiClip, TClip } from 'services/highlighter/models/highlighter.models';
import { useRef, useEffect, useCallback } from 'react';
import styles from './ClipsView.m.less';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { getContextEventTypes } from 'services/highlighter/models/game-config.models';
export const isAiClip = (clip: TClip): clip is IAiClip => clip.source === 'AiClip';

export function sortClipsByOrder(clips: TClip[], streamId: string | undefined): TClip[] {
  let sortedClips;

  if (streamId) {
    const clipsWithOrder = clips
      .filter(c => c.streamInfo?.[streamId]?.orderPosition !== undefined && c.deleted !== true)
      .sort(
        (a: TClip, b: TClip) =>
          a.streamInfo![streamId]!.orderPosition - b.streamInfo![streamId]!.orderPosition,
      );

    const clipsWithOutOrder = clips.filter(
      c =>
        (c.streamInfo === undefined ||
          c.streamInfo[streamId] === undefined ||
          c.streamInfo[streamId]?.orderPosition === undefined) &&
        c.deleted !== true,
    );

    sortedClips = [...clipsWithOrder, ...clipsWithOutOrder];
  } else {
    sortedClips = clips
      .filter(c => c.deleted !== true)
      .sort((a: TClip, b: TClip) => a.globalOrderPosition - b.globalOrderPosition);
  }

  return sortedClips;
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

export interface IFilterOptions {
  rounds: number[];
  targetDuration: number;
  includeAllEvents: boolean;
}

export function aiFilterClips(
  clips: TClip[],
  streamId: string | undefined,
  options: IFilterOptions,
): TClip[] {
  const { rounds, targetDuration, includeAllEvents } = options;

  const selectedRounds =
    rounds.length === 1 && rounds[0] === 0
      ? [
          ...new Set(
            clips
              .filter(clip => clip.source === 'AiClip')
              .map(clip => (clip as IAiClip).aiInfo.metadata?.round),
          ),
        ]
      : rounds;

  // Sort rounds by score (descending)
  const sortedRounds = selectedRounds.sort(
    (a, b) => getRoundScore(b, clips) - getRoundScore(a, clips),
  );

  let clipsFromRounds: TClip[] = [];

  let totalDuration = 0;
  for (let i = 0; i < sortedRounds.length; ++i) {
    if (totalDuration > targetDuration) {
      break;
    } else {
      //Todo M: how do sort? Per round or all together and then the rounds are in the stream order again?
      const roundIndex = sortedRounds[i];
      const roundClips = sortClipsByOrder(getClipsOfRound(roundIndex, clips), streamId);
      clipsFromRounds = [...clipsFromRounds, ...roundClips];
      totalDuration = getCombinedClipsDuration(clipsFromRounds);
    }
  }

  const contextTypes = getContextEventTypes(EGame.FORTNITE);
  // always include the start and end of the round > context type

  const clipsSortedByScore: TClip[] = clipsFromRounds
    .map(clip => {
      if ((clip as IAiClip).aiInfo.inputs.some(input => contextTypes.includes(input.type))) {
        return { ...clip, aiInfo: { score: 999 } } as TClip;
      } else {
        return clip as TClip;
      }
    })
    .sort((a, b) => (a as IAiClip).aiInfo.score - (b as IAiClip).aiInfo.score);

  const filteredClips: TClip[] = clipsFromRounds;
  let currentDuration = getCombinedClipsDuration(filteredClips);

  const BUFFER_SEC = 10;

  while (currentDuration > targetDuration + BUFFER_SEC) {
    if (clipsSortedByScore === undefined || clipsSortedByScore.length === 0) {
      break;
    }
    clipsSortedByScore.splice(0, 1); // remove from our sorted array

    currentDuration = getCombinedClipsDuration(clipsSortedByScore);
  }

  return clipsSortedByScore;
}

export function getCombinedClipsDuration(clips: TClip[]): number {
  return clips.reduce(
    (sum, clip) => sum + (clip.duration ? clip.duration - (clip.startTrim + clip.endTrim) : 0),
    0,
  );
}

function getClipsOfRound(round: number, clips: TClip[]): TClip[] {
  return clips.filter(
    clip => clip.source === 'AiClip' && (clip as IAiClip).aiInfo.metadata.round === round,
  );
}

function getRoundScore(round: number, clips: TClip[]): number {
  return getClipsOfRound(round, clips).reduce(
    (sum, clip) => sum + ((clip as IAiClip).aiInfo?.score || 0),
    0,
  );
}
