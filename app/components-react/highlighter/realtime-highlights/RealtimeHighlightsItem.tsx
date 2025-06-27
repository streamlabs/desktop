import { Button } from 'antd';
import React from 'react';
import { INewClipData } from 'services/highlighter/models/highlighter.models';
import { getUniqueEmojiConfigFromAiInfo } from '../ClipPreviewInfo';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import styles from './RealtimeHighlightsItem.m.less';
import cx from 'classnames';

interface RealtimeHighlightItemProps {
  clipData: INewClipData;
  onEventItemClick: (highlight: any) => void;
  game?: EGame; // Optional game prop, if needed
  latestItem: boolean;
}

export default function RealtimeHighlightsItem(props: RealtimeHighlightItemProps) {
  const { clipData, onEventItemClick, game, latestItem } = props;
  const emojiDisplayConfig = getUniqueEmojiConfigFromAiInfo(clipData.aiClipInfo, game);
  return (
    <div className={cx(styles.itemWrapper)}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        {emojiDisplayConfig.map((displayConfig, index) => {
          return (
            <p key={index} style={{ margin: 0 }}>
              {displayConfig.emoji} {displayConfig.count > 1 ? displayConfig.count : ''}{' '}
              {displayConfig.description}
            </p>
          );
        })}
      </div>

      <Button
        type="default"
        size="small"
        style={{ width: '100%' }}
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
