import { Button } from 'antd';
import React, { useState } from 'react';
import { EAiDetectionState } from 'services/highlighter/models/ai-highlighter.models';
import {
  IHighlightedStream,
  TClip,
  IViewState,
  EHighlighterView,
} from 'services/highlighter/models/highlighter.models';
import { $t } from 'services/i18n';
import styles from './Header.m.less';
import { Services } from 'components-react/service-provider';

export default function ActionBar({
  stream,
  clips,
  emitExportVideo,
  emitShowStreamClips,
  emitSetView,
  emitFeedbackForm,
  emitPostVideo,
}: {
  stream: IHighlightedStream;
  clips: TClip[];
  emitExportVideo: () => void;
  emitShowStreamClips: () => void;
  emitSetView: (data: IViewState) => void;
  emitFeedbackForm: (clipsLength: number) => void;
  emitPostVideo: () => void;
}): JSX.Element {
  const { UsageStatisticsService, HighlighterService } = Services;
  const [thumbsDownVisible, setThumbsDownVisible] = useState(!stream?.feedbackLeft);

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

  function cancelHighlightGeneration() {
    HighlighterService.actions.cancelHighlightGeneration(stream.id);
  }

  function restartAiDetection() {
    HighlighterService.actions.restartAiDetection(stream.path, stream);
  }

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
            cancelHighlightGeneration();
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
          style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
        >
          <i className="icon-download" style={{ marginRight: '4px' }} />
          {/* {$t('Export highlight reel')} */}
          Export all clips
        </Button>

        <Button
          size="large"
          onClick={() => {
            emitPostVideo();
            // const clipCollectionIds = HighlighterService.clipCollectionManager
            //   .getClipCollectionsByStreamId(stream.id)
            //   ?.filter(
            //     collectionId =>
            //       HighlighterService.views.clipCollectionsDictionary[collectionId]
            //         .collectionExportInfo?.exportedFilePath !== undefined,
            //   );

            // if (clipCollectionIds) {
            //   clipCollectionIds.forEach(collectionId => {
            //     HighlighterService.actions.queueUploadClipCollection(collectionId);
            //   });
            // }
          }}
        >
          post all exported clips
        </Button>
        <Button
          size="large"
          onClick={() => {
            HighlighterService.clipCollectionManager.autoCreateClipCollections(stream.id);
          }}
        >
          ai gen
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
              restartAiDetection();
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
