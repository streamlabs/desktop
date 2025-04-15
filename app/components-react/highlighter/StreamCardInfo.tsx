import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { IAiClip, isAiClip, TClip } from 'services/highlighter/models/highlighter.models';
import { getConfigByGame, getEventConfig } from 'services/highlighter/models/game-config.models';
import React from 'react';
import Tooltip from 'components-react/shared/Tooltip';

interface EventDisplay {
  emoji: string;
  description: string;
  orderPosition: number;
  count: number;
  type: string;
}

export default function StreamCardInfo({
  clips,
  game,
}: {
  clips: TClip[];
  game: EGame;
}): JSX.Element {
  const aiClips: IAiClip[] = [];
  const manualClips: TClip[] = [];

  clips.forEach(clip => {
    if (isAiClip(clip)) {
      aiClips.push(clip);
    } else {
      manualClips.push(clip);
    }
  });

  const eventTypeCounts: Record<string, number> = {};
  const uniqueRounds = new Set<number>();

  aiClips.forEach(clip => {
    if (clip.aiInfo.metadata.round) {
      uniqueRounds.add(clip.aiInfo.metadata.round);
    }
    clip.aiInfo.inputs.forEach(input => {
      if (eventTypeCounts[input.type]) {
        eventTypeCounts[input.type] += 1;
      } else {
        eventTypeCounts[input.type] = 1;
      }
    });
  });

  if (uniqueRounds.size > 0) {
    eventTypeCounts['round'] = uniqueRounds.size;
  }

  if (manualClips.length > 0) {
    eventTypeCounts['manual'] = manualClips.length;
  }

  const stringsToShow: EventDisplay[] = Object.entries(eventTypeCounts)
    .map(([type, count]) => {
      const eventInfo = getEventConfig(game, type);

      if (eventInfo) {
        return {
          emoji: eventInfo.emoji,
          description: count === 1 ? eventInfo.description.singular : eventInfo.description.plural,
          orderPosition: eventInfo.orderPriority,
          count,
          type,
        };
      }

      return {
        emoji: '⚡',
        description: count === 1 ? type : `${type}s`,
        count,
        orderPosition: 99,
        type,
      };
    })
    .sort((a, b) => a.orderPosition - b.orderPosition);

  return (
    <div style={{ width: '100%' }}>
      <Tooltip
        title={stringsToShow
          .map(item => `${item.emoji} ${item.count} ${item.description}`)
          .join(' | ')}
      >
        <div
          className="stream-card-info"
          style={{
            display: 'block',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {stringsToShow.length > 0 ? (
            stringsToShow.map((item, index) => (
              <React.Fragment key={index}>
                <span style={{ marginRight: '10px' }}>
                  {item.emoji} {item.count} {item.description}
                </span>
              </React.Fragment>
            ))
          ) : (
            <span>No events found</span>
          )}
        </div>
      </Tooltip>
    </div>
  );
}
