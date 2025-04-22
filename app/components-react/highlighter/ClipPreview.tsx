import { TClip } from 'services/highlighter/models/highlighter.models';
import { SCRUB_HEIGHT, SCRUB_WIDTH, SCRUB_FRAMES } from 'services/highlighter/constants';
import React, { useState } from 'react';
import { Services } from 'components-react/service-provider';
import { BoolButtonInput } from 'components-react/shared/inputs/BoolButtonInput';
import styles from './ClipPreview.m.less';
import { Button, Tooltip } from 'antd';
import { $t } from 'services/i18n';
import { isAiClip } from './utils';
import { useVuex } from 'components-react/hooks';
import ClipPreviewInfo from './ClipPreviewInfo';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import * as remote from '@electron/remote';

export default function ClipPreview(props: {
  clipId: string;
  streamId: string | undefined;
  emitShowTrim: () => void;
  emitShowRemove: () => void;
  emitOpenFileInLocation: () => void;
}) {
  const { HighlighterService } = Services;
  const v = useVuex(() => ({
    clip: HighlighterService.views.clipsDictionary[props.clipId] as TClip,
  }));

  const [scrubFrame, setScrubFrame] = useState<number>(0);
  const clipThumbnail = v.clip.scrubSprite || '';
  const enabled = v.clip.deleted ? false : v.clip.enabled;

  const game = HighlighterService.getGameByStreamId(props.streamId);

  if (!v.clip) {
    return <>deleted</>;
  }

  function mouseMove(e: React.MouseEvent) {
    const frameIdx = Math.floor((e.nativeEvent.offsetX / SCRUB_WIDTH) * SCRUB_FRAMES);
    if (scrubFrame !== frameIdx) {
      setScrubFrame(frameIdx);
    }
  }

  function setEnabled(enabled: boolean) {
    HighlighterService.actions.enableClip(v.clip.path, enabled);
  }

  return (
    <div className={styles.previewClip} style={{ opacity: v.clip.enabled ? 1.0 : 0.3 }}>
      <div style={{ height: `${SCRUB_HEIGHT}px`, position: 'relative' }}>
        {!v.clip.deleted && (
          <img
            src={clipThumbnail}
            className={styles.previewImage}
            style={{
              width: `${SCRUB_WIDTH}px`,
              height: `${SCRUB_HEIGHT}px`,

              objectPosition: `-${scrubFrame * SCRUB_WIDTH}px`,
            }}
            onMouseMove={mouseMove}
            onClick={props.emitShowTrim}
          />
        )}
        {v.clip.deleted && (
          <div
            style={{
              width: `${SCRUB_WIDTH}px`,
              height: `${SCRUB_HEIGHT}px`,
            }}
            className={styles.deletedPreview}
          >
            <i className={`icon-trash ${styles.deletedIcon}`} />
          </div>
        )}
        <div className={styles.flameHypescoreWrapper}>
          {isAiClip(v.clip) && <FlameHypeScore score={v.clip.aiInfo.score} />}
        </div>
        <span className={styles.enableButton}>
          <BoolButtonInput
            tooltip={enabled ? $t('Disable clip') : $t('Enable clip')}
            tooltipPlacement="top"
            value={enabled}
            onChange={setEnabled}
            checkboxStyles={{
              width: '24px',
              height: '24px',
              fontSize: '14px',
              background: 'white',
              borderColor: '#333',
            }}
            checkboxActiveStyles={{ background: 'var(--teal-hover)' }}
          />
        </span>
        <div className={styles.previewClipMoving}>
          <div className={styles.controlsContainer}>
            {/* left */}
            <div className={styles.durationInfo}>
              <span className={styles.durationLabel}>
                {formatSecondsToHMS(v.clip.duration! - (v.clip.startTrim + v.clip.endTrim) || 0)}
              </span>
            </div>
            {/* right */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <div
                style={{
                  fontSize: '19px',
                }}
              >
                {isAiClip(v.clip) ? (
                  <ClipPreviewInfo clip={v.clip} game={game} />
                ) : (
                  <div className={styles.highlighterIcon}>
                    <i className="icon-highlighter" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={styles.previewClipBottomBar}>
            <Button size="large" className={styles.actionButton} onClick={props.emitShowRemove}>
              <i className="icon-trash" />
            </Button>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button size="large" className={styles.actionButton} onClick={props.emitShowTrim}>
                <i className="icon-trim" style={{ marginRight: '8px' }} /> {$t('Trim')}
              </Button>
              <Tooltip title={$t('Open file location')} placement="top">
                <Button
                  size="large"
                  className={styles.actionButton}
                  onClick={props.emitOpenFileInLocation}
                >
                  <i className="icon-pop-out-2" />
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatSecondsToHMS(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  if (totalSeconds === 0) {
    return '0s';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${hours !== 0 ? hours.toString() + 'h ' : ''} ${minutes !== 0 ? minutes.toString() + 'm ' : ''
    }${remainingSeconds !== 0 ? remainingSeconds.toString() + 's' : ''}`;
}

function FlameHypeScore({ score }: { score: number }) {
  if (score === undefined) {
    return <></>;
  }
  const normalizedScore = Math.min(1, Math.max(0, score));
  const fullFlames = Math.ceil(normalizedScore * 5);

  return (
    <div className="flex items-center gap-1" style={{ fontSize: '19px' }}>
      {Array.from({ length: fullFlames }).map((_, index) => (
        <React.Fragment key={'on' + index}>🔥</React.Fragment>
      ))}

      {Array.from({ length: 5 - fullFlames }).map((_, index) => (
        <span key={'off' + index} style={{ opacity: '0.3' }}>
          🔥
        </span>
      ))}
    </div>
  );
}
