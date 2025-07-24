import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EHighlighterView,
  IHighlightedStream,
  IViewState,
  TClip,
} from 'services/highlighter/models/highlighter.models';
import styles from './StreamCard.m.less';
import { Button, Tooltip } from 'antd';
import { Services } from 'components-react/service-provider';
import { isAiClip } from './utils';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import { EAiDetectionState } from 'services/highlighter/models/ai-highlighter.models';
import * as remote from '@electron/remote';
import StreamCardInfo from './StreamCardInfo';
import StreamCardModal, { TModalStreamCard } from './StreamCardModal';
import { supportedGames } from 'services/highlighter/models/game-config.models';

export default function StreamCard({
  streamId,
  emitSetView,
}: {
  streamId: string;
  emitSetView: (data: IViewState) => void;
}) {
  const [modal, setModal] = useState<TModalStreamCard | null>(null);
  const [clipsOfStreamAreLoading, setClipsOfStreamAreLoading] = useState<string | null>(null);

  const { HighlighterService } = Services;
  const clips = useMemo(() => {
    return HighlighterService.views.clips
      .filter(c => c.streamInfo?.[streamId])
      .map(clip => {
        if (isAiClip(clip) && (clip.aiInfo as any).moments) {
          clip.aiInfo.inputs = (clip.aiInfo as any).moments;
        }
        return clip;
      });
  }, [HighlighterService.views.clips.filter(clips => clips.streamInfo?.[streamId]), streamId]);

  const stream = useVuex(() => HighlighterService.views.highlightedStreamsDictionary[streamId]);

  const [thumbnailsLoaded, setClipsLoaded] = useState<boolean>(false);
  const prevStateRef = useRef<EAiDetectionState | null>(null);
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    if (
      prevStateRef.current === EAiDetectionState.IN_PROGRESS &&
      stream.state.type === EAiDetectionState.FINISHED &&
      !thumbnailsLoaded
    ) {
      // This is a workaround.
      // Sometimes it takes longer to to generate the thumbnails. Event tho the path and file is already there, the image can't be loaded
      // Waiting 3 seconds and then render again solves that. Obviously not the best way
      timeout = setTimeout(() => {
        setClipsLoaded(true);
      }, clips.length * 1000);
    }
    prevStateRef.current = stream?.state?.type || null;

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [streamId, stream]);

  if (!stream) {
    return <></>;
  }

  const game = HighlighterService.getGameByStreamId(streamId);
  function shareFeedback() {
    remote.shell.openExternal(
      'https://support.streamlabs.com/hc/en-us/requests/new?ticket_form_id=31967205905051',
    );
  }

  function showStreamClips() {
    if (stream?.state.type !== EAiDetectionState.IN_PROGRESS) {
      emitSetView({ view: EHighlighterView.CLIPS, id: stream?.id });
    }
  }

  async function previewVideo(id: string) {
    setClipsOfStreamAreLoading(id);

    try {
      await HighlighterService.actions.return.loadClips(id);
      setClipsOfStreamAreLoading(null);
      setModal('preview');
    } catch (error: unknown) {
      console.error('Error loading clips for preview export', error);
      setClipsOfStreamAreLoading(null);
    }
  }

  async function exportVideo(id: string) {
    setClipsOfStreamAreLoading(id);

    try {
      await HighlighterService.actions.return.loadClips(id);
      setClipsOfStreamAreLoading(null);
      setModal('export');
    } catch (error: unknown) {
      console.error('Error loading clips for export', error);
      setClipsOfStreamAreLoading(null);
    }
  }

  function cancelHighlightGeneration() {
    HighlighterService.actions.cancelHighlightGeneration(stream.id);
  }

  if (stream.state.type === EAiDetectionState.FINISHED && clips.length === 0) {
    return (
      <>
        {modal && (
          <StreamCardModal
            streamId={streamId}
            modal={modal}
            onClose={() => {
              setModal(null);
            }}
            game={game}
          />
        )}
        <div className={styles.streamCard}>
          <Button
            size="large"
            className={styles.deleteButton}
            onClick={e => {
              setModal('remove');
              e.stopPropagation();
            }}
            style={{ backgroundColor: '#00000040', border: 'none', position: 'absolute' }}
          >
            <i className="icon-trash" />
          </Button>
          <div className={styles.requirements}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '280px' }}>
              <h2>{$t('No clips found')}</h2>
              <p style={{ marginBottom: '8px' }}>
                {$t('Please make sure all the requirements are met:')}
              </p>
              <ul style={{ marginBottom: 0, marginLeft: '-28px' }}>
                <li>{$t('Game is supported')}</li>
                <li>{$t('Game language is English')}</li>
                <li>{$t('Map and Stats area is fully visible')}</li>
                <li>{$t('Game is fullscreen in your stream')}</li>
                <li>{$t('Game mode is supported')}</li>
              </ul>
              <a onClick={() => setModal('requirements')} style={{ marginBottom: '14px' }}>
                {$t('Show details')}
              </a>
              <p>{$t('All requirements met but no luck?')}</p>

              <a onClick={shareFeedback}>
                {$t('Take a screenshot of your stream and share it here')}
              </a>
            </div>
          </div>
          <div className={styles.streaminfoWrapper}>
            <div
              className={styles.titleRotatedClipsWrapper}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div className={styles.titleDateWrapper}>
                <h2 className={styles.streamcardTitle}>{stream.title}</h2>
                <p style={{ margin: 0, fontSize: '12px' }}>
                  {new Date(stream.date).toDateString()}
                </p>
              </div>
              <Button
                size="large"
                className={styles.cancelButton}
                onClick={shareFeedback}
                icon={<i className="icon-community" style={{ marginRight: '8px' }} />}
              >
                {$t('Share feedback')}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {modal && (
        <StreamCardModal
          streamId={streamId}
          modal={modal}
          onClose={() => {
            setModal(null);
          }}
          game={game}
        />
      )}
      <div
        className={styles.streamCard}
        onClick={() => {
          showStreamClips();
        }}
      >
        <Thumbnail
          clips={clips}
          clipsOfStreamAreLoading={clipsOfStreamAreLoading}
          stream={stream}
          emitGeneratePreview={() => {
            previewVideo(streamId);
          }}
          emitCancelHighlightGeneration={cancelHighlightGeneration}
          emitRemoveStream={() => {
            setModal('remove');
          }}
        />
        <div className={styles.streaminfoWrapper}>
          <div className={styles.titleRotatedClipsWrapper}>
            <div className={styles.titleDateWrapper}>
              <h2 className={styles.streamcardTitle}>{stream.title}</h2>
              <p style={{ margin: 0, fontSize: '12px' }}>{new Date(stream.date).toDateString()}</p>
            </div>
            <RotatedClips clips={clips} />
          </div>
          <h3 className={styles.emojiWrapper}>
            {stream.state.type === EAiDetectionState.FINISHED ? (
              <StreamCardInfo clips={clips} game={game} />
            ) : (
              <div style={{ height: '22px' }}> </div>
            )}
          </h3>
          <ActionBar
            stream={stream}
            clips={clips}
            emitCancelHighlightGeneration={cancelHighlightGeneration}
            emitExportVideo={() => exportVideo(streamId)}
            emitShowStreamClips={showStreamClips}
            clipsOfStreamAreLoading={clipsOfStreamAreLoading}
            emitRestartAiDetection={() => {
              HighlighterService.actions.restartAiDetection(stream.path, stream);
            }}
            emitSetView={emitSetView}
            emitFeedbackForm={() => {
              setModal('feedback');
            }}
          />
        </div>
      </div>
    </>
  );
}

function ActionBar({
  stream,
  clips,
  clipsOfStreamAreLoading,
  emitCancelHighlightGeneration,
  emitExportVideo,
  emitShowStreamClips,
  emitRestartAiDetection,
  emitSetView,
  emitFeedbackForm,
}: {
  stream: IHighlightedStream;
  clips: TClip[];
  clipsOfStreamAreLoading: string | null;
  emitCancelHighlightGeneration: () => void;
  emitExportVideo: () => void;
  emitShowStreamClips: () => void;
  emitRestartAiDetection: () => void;
  emitSetView: (data: IViewState) => void;
  emitFeedbackForm: (clipsLength: number) => void;
}): JSX.Element {
  const { UsageStatisticsService, HighlighterService } = Services;

  function getFailedText(state: EAiDetectionState): string {
    switch (state) {
      case EAiDetectionState.ERROR:
        return $t('Highlights failed');
      case EAiDetectionState.CANCELED_BY_USER:
        return $t('Highlights cancelled');
      default:
        return '';
    }
  }

  const [thumbsDownVisible, setThumbsDownVisible] = useState(!stream?.feedbackLeft);

  const clickThumbsDown = () => {
    if (stream?.feedbackLeft) {
      return;
    }

    setThumbsDownVisible(false);

    stream.feedbackLeft = true;
    HighlighterService.updateStream(stream);

    UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'ThumbsDown',
      streamId: stream?.id,
      game: stream?.game,
      clips: clips?.length,
    });

    emitFeedbackForm(clips.length);
  };

  // In Progress
  if (stream?.state.type === EAiDetectionState.IN_PROGRESS) {
    return (
      <div className={styles.progressbarBackground}>
        <div className={styles.progressbarText}>{$t('Searching for highlights...')}</div>
        <div
          className={styles.progressbarProgress}
          style={{
            opacity: stream.state.progress < 1 ? 0 : 1,
            transform: `scaleX(${stream.state.progress / 100})`,
            transformOrigin: 'left',
            transition: 'transform 1000ms',
          }}
        ></div>

        <Button
          size="large"
          className={styles.cancelButton}
          onClick={e => {
            e.stopPropagation();
            emitCancelHighlightGeneration();
          }}
        >
          <i className="icon-close" />
        </Button>
      </div>
    );
  }

  // If finished
  if (stream && clips.length > 0) {
    return (
      <div className={styles.buttonBarWrapper}>
        {thumbsDownVisible && (
          <Button
            icon={<i className="icon-thumbs-down" style={{ fontSize: '14px' }} />}
            size="large"
            onClick={e => {
              clickThumbsDown();
              e.stopPropagation();
            }}
          />
        )}
        <Button
          icon={<i className="icon-edit" style={{ marginRight: '4px' }} />}
          size="large"
          onClick={emitShowStreamClips}
        >
          {$t('Edit Clips')}
        </Button>

        {/* TODO: What clips should be included when user clicks this button + bring normal export modal in here */}
        <Button
          size="large"
          type="primary"
          onClick={e => {
            emitExportVideo();
            setThumbsDownVisible(false);
            e.stopPropagation();
          }}
          style={{ display: 'grid', gridTemplateAreas: 'stack' }}
        >
          <div
            style={{
              visibility: clipsOfStreamAreLoading === stream.id ? 'visible' : 'hidden',
              gridArea: 'stack',
            }}
          >
            <i className="fa fa-spinner fa-pulse" />
          </div>
          <span
            style={{
              visibility: clipsOfStreamAreLoading !== stream.id ? 'visible' : 'hidden',
              gridArea: 'stack',
            }}
          >
            <i className="icon-download" style={{ marginRight: '4px' }} />
            {$t('Export highlight reel')}
          </span>
        </Button>
      </div>
    );
  }

  //if failed or no clips
  return (
    <div className={styles.buttonBarWrapper}>
      <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center' }}>
        {getFailedText(stream.state.type)}
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {stream?.state.type === EAiDetectionState.CANCELED_BY_USER ? (
          <Button
            size="large"
            onClick={e => {
              emitRestartAiDetection();
              e.stopPropagation();
            }}
          >
            {$t('Restart')}
          </Button>
        ) : (
          <Button
            size="large"
            onClick={e => {
              emitSetView({ view: EHighlighterView.CLIPS, id: stream!.id });
              e.stopPropagation();
            }}
          >
            {$t('Add Clips')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function Thumbnail({
  clips,
  clipsOfStreamAreLoading,
  stream,
  emitGeneratePreview,
  emitCancelHighlightGeneration,
  emitRemoveStream,
}: {
  clips: TClip[];
  clipsOfStreamAreLoading: string | null;
  stream: IHighlightedStream;
  emitGeneratePreview: () => void;
  emitCancelHighlightGeneration: () => void;
  emitRemoveStream: () => void;
}) {
  function getThumbnailText(state: EAiDetectionState): JSX.Element | string {
    if (clipsOfStreamAreLoading === stream?.id) {
      return <i className="fa fa-spinner fa-pulse" />;
    }

    if (clips.length > 0) {
      return <PlayButton />;
    }
    switch (state) {
      case EAiDetectionState.IN_PROGRESS:
        return $t('Searching for highlights...');
      case EAiDetectionState.FINISHED:
        if (clips.length === 0) {
          return $t('Not enough highlights found');
        }
        return <PlayButton />;
      case EAiDetectionState.CANCELED_BY_USER:
        return $t('Highlights cancelled');
      case EAiDetectionState.ERROR:
        return $t('Highlights cancelled');
      default:
        return '';
    }
  }

  return (
    <div className={`${styles.thumbnailWrapper} `}>
      <Button
        size="large"
        className={styles.deleteButton}
        onClick={e => {
          if (stream.state.type === EAiDetectionState.IN_PROGRESS) {
            emitCancelHighlightGeneration();
          }
          emitRemoveStream();
          e.stopPropagation();
        }}
        style={{ backgroundColor: '#00000040', border: 'none', position: 'absolute' }}
      >
        <i className="icon-trash" />
      </Button>
      <img
        onClick={e => {
          if (stream.state.type !== EAiDetectionState.IN_PROGRESS) {
            emitGeneratePreview();
            e.stopPropagation();
          }
        }}
        style={{ height: '100%' }}
        src={
          clips.find(clip => clip?.streamInfo?.[stream.id]?.orderPosition === 0)?.scrubSprite ||
          clips.find(clip => clip.scrubSprite)?.scrubSprite
        }
      />
      <div className={styles.centeredOverlayItem}>
        <div
          onClick={e => {
            if (stream.state.type !== EAiDetectionState.IN_PROGRESS) {
              emitGeneratePreview();
              e.stopPropagation();
            }
          }}
        >
          {getThumbnailText(stream.state.type)}
        </div>
      </div>
    </div>
  );
}

export function RotatedClips({ clips }: { clips: TClip[] }) {
  return (
    <div style={{ width: '74px', position: 'relative' }}>
      {clips.length > 0 ? (
        <div style={{ transform: 'translateX(-10px)' }}>
          <div className={styles.clipsAmount}>
            <span>{clips.length}</span>
            <span>clips</span>
          </div>
          {clips.slice(0, 3).map((clip, index) => (
            <div
              className={styles.thumbnailWrapperSmall}
              style={{
                rotate: `${(index - 1) * 6}deg`,
                scale: '1.2',
                transform: `translate(${(index - 1) * 9}px, ${index === 1 ? 0 + 4 : 2 + 4}px)`,
                zIndex: index === 1 ? 10 : 0,
              }}
              key={index}
            >
              <img style={{ height: '100%' }} src={clip.scrubSprite || ''} />
            </div>
          ))}
        </div>
      ) : (
        ''
      )}
    </div>
  );
}

export const PlayButton = () => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M31.3111 17.05L12.9395 4.36284C11.6534 3.45661 10 4.36284 10 5.8128V31.1872C10 32.6372 11.6534 33.5434 12.9395 32.6372L31.3111 19.95C32.2296 19.225 32.2296 17.775 31.3111 17.05"
      fill="white"
    />
  </svg>
);
export const PauseButton = () => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="5" width="10" height="28" rx="2" fill="white" />
    <rect x="21" y="5" width="10" height="28" rx="2" fill="white" />
  </svg>
);
