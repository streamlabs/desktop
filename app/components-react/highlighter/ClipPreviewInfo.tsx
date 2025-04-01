import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { IAiClip } from 'services/highlighter/models/highlighter.models';
import { getConfigByGame, getEventConfig } from 'services/highlighter/models/game-config.models';
import styles from './ClipPreview.m.less';
import React from 'react';

export default function ClipPreviewInfo({
  clip,
  game,
}: {
  clip: IAiClip;
  game: EGame;
}): JSX.Element {
  if (!clip || !clip.aiInfo) {
    return <span>No event data</span>;
  }

  const uniqueInputTypes = new Set<string>();
  if (clip.aiInfo.inputs && Array.isArray(clip.aiInfo.inputs)) {
    clip.aiInfo.inputs.forEach(input => {
      if (input.type) {
        uniqueInputTypes.add(input.type);
      }
    });
  }

  const eventDisplays = Array.from(uniqueInputTypes).map(type => {
    const eventInfo = getEventConfig(game, type);

    if (eventInfo) {
      return {
        emoji: eventInfo.emoji,
        description: eventInfo.description.singular,
        type,
      };
    }

    return {
      emoji: '⚡',
      description: type,
      type,
    };
  });

  return (
    <div
      style={{
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
      }}
    >
      {eventDisplays.map(event => {
        return <>{event.emoji}</>;
      })}
      {clip.aiInfo.metadata?.round && (
        <div className={styles.roundTag}>{`Round: ${clip.aiInfo.metadata.round}`}</div>
      )}{' '}
    </div>
  );
}
