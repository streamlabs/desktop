import { EGame, IAiClipInfo } from 'services/highlighter/models/ai-highlighter.models';
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

  const eventDisplays = getUniqueEmojiConfigFromAiInfo(clip.aiInfo, game);
  return (
    <div
      style={{
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
      }}
    >
      {eventDisplays.map((event, index) => {
        return <React.Fragment key={index}>{event.emoji}</React.Fragment>;
      })}
      {clip.aiInfo.metadata?.round && (
        <div className={styles.roundTag}>{`Round: ${clip.aiInfo.metadata.round}`}</div>
      )}{' '}
    </div>
  );
}

export interface EmojiConfig {
  emoji: string;
  description: string;
  type: string;
}

export function getUniqueEmojiConfigFromAiInfo(aiInfos: IAiClipInfo, game?: EGame): EmojiConfig[] {
  const uniqueInputTypes = new Set<string>();
  if (aiInfos.inputs && Array.isArray(aiInfos.inputs)) {
    aiInfos.inputs.forEach(aiInput => {
      if (aiInput.type) {
        uniqueInputTypes.add(aiInput.type);
      }
    });
  }

  const eventDisplays = Array.from(uniqueInputTypes).map(type => {
    if (game) {
      const eventInfo = getEventConfig(game, type);

      if (eventInfo) {
        return {
          emoji: eventInfo.emoji,
          description: eventInfo.description.singular,
          type,
        };
      }
    }

    return {
      emoji: '⚡',
      description: type,
      type,
    };
  });
  return eventDisplays;
}
