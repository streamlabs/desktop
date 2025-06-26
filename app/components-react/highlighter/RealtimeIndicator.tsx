import { Button } from 'antd';
import React, { useState, useEffect } from 'react';
import { $t } from 'services/i18n';
import styles from './RealtimeIndicator.m.less';
import cx from 'classnames';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { GAME_CONFIGS } from 'services/highlighter/models/game-config.models';
import { TRealtimeFeedEvent } from './realtime-highlights/RealtimeHighlightsFeed';

export default function HighlightGenerator({
  eventType,
  emitCancel,
}: {
  eventType?: TRealtimeFeedEvent;
  emitCancel: () => void;
}) {
  const [animateOnce, setAnimateOnce] = useState(false);
  const [emoji, setEmoji] = useState<string>('');

  // Run animation once when emoji prop changes
  useEffect(() => {
    if (eventType) {
      setEmoji(getEmojiByEventType(eventType));
      setAnimateOnce(true);
      const timeout = setTimeout(() => setAnimateOnce(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [eventType]);

  function getEmojiByEventType(eventType: { type: string; game: EGame }) {
    return GAME_CONFIGS[eventType.game].inputTypeMap[eventType.type]?.emoji || '🤖';
  }

  return (
    <div className={cx(styles.realtimeDetectionAction)}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div
          className={cx(styles.backgroundPulse, animateOnce && styles.activityAnimation)}
          // onAnimationEnd={() => setAnimateOnce(false)}
        />
        {animateOnce ? (
          <div className={styles.emoji}>{emoji}</div>
        ) : (
          <div className={styles.pulseWrapper}>
            <div className={styles.pulse} />
            <div className={styles.dot} />
          </div>
        )}
        <p style={{ margin: 0, zIndex: 3, opacity: 0.7 }}>{$t('Ai detection in progress')}</p>
      </div>
      <Button
        size="small"
        type="ghost"
        style={{ border: 'none', margin: 0, display: 'flex', alignItems: 'center' }}
        onClick={e => {
          e.stopPropagation();
          emitCancel();
        }}
      >
        <i className="icon-close" />
      </Button>
    </div>
  );
}
