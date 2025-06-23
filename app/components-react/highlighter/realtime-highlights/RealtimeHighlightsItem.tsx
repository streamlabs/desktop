import { Button } from 'antd';
import React from 'react';
import { INewClipData } from 'services/highlighter/models/highlighter.models';
import { getUniqueEmojiConfigFromAiInfo } from '../ClipPreviewInfo';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';

interface RealtimeHighlightItemProps {
  clipData: INewClipData;
  onEventItemClick: (highlight: any) => void;
  game?: EGame; // Optional game prop, if needed
}

export default function RealtimeHighlightsItem(props: RealtimeHighlightItemProps) {
  const { clipData, onEventItemClick, game } = props;
  const emojiDisplayConfig = getUniqueEmojiConfigFromAiInfo(clipData.aiClipInfo, game);
  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        {emojiDisplayConfig.map((displayConfig, index) => {
          return (
            <React.Fragment key={index}>
              {displayConfig.emoji} {displayConfig.description}
            </React.Fragment>
          );
        })}
      </div>

      <Button
        type="link"
        size="small"
        onClick={e => {
          e.stopPropagation();
          onEventItemClick(clipData);
        }}
      >
        View highlight
      </Button>
    </div>
  );
}
