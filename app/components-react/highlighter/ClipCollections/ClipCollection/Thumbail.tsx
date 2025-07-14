import { Services } from 'components-react/service-provider';
import React, { useMemo } from 'react';
import {
  EClipCollectionExportState,
  IClipCollection,
  IClipCollectionClip,
} from 'services/highlighter/clip-collections';
import { SCRUB_WIDTH } from 'services/highlighter/constants';
import { EOrientation } from 'services/highlighter/models/ai-highlighter.models';
import cx from 'classnames';
import styles from './ClipCollection.m.less';
import { IExportInfo } from 'services/highlighter/models/rendering.models';
import { $t } from 'services/i18n';

export default function Thumbnail({ collectionInfo }: { collectionInfo?: IClipCollection }) {
  const { HighlighterService } = Services;

  const clips = collectionInfo?.clips ? Object.values(collectionInfo.clips) : [];
  const generatedThumbnail = '';
  const exportedFilePath = collectionInfo?.collectionExportInfo?.exportedFilePath;

  const firstClip = useMemo(() => {
    if (!clips || clips.length === 0) return undefined;
    return clips.reduce((lowest, current) =>
      current.collectionOrderPosition < lowest.collectionOrderPosition ? current : lowest,
    );
  }, [clips]);

  const clipThumbnail =
    HighlighterService.views.clipsDictionary[firstClip?.clipId || '']?.scrubSprite;

  return (
    <div
      className={cx(
        styles.thumbnail,
        collectionInfo?.collectionExportInfo?.state === EClipCollectionExportState.EXPORTING &&
          styles.thumbnailInProgress,
      )}
      style={
        collectionInfo?.clipCollectionInfo.aspectRatio === EOrientation.HORIZONTAL
          ? { aspectRatio: '16/9' }
          : { aspectRatio: '9/16' }
      }
    >
      {/* {collectionInfo?.collectionExportInfo?.exportInfo && ( */}
      {true && (
        <StateTag
          state={collectionInfo?.collectionExportInfo?.state}
          exportInfo={collectionInfo?.collectionExportInfo?.exportInfo}
        />
      )}
      <ThumbnailMedia collectionInfo={collectionInfo} clipThumbnail={clipThumbnail} />
    </div>
  );
}

function StateTag({
  state,
  exportInfo,
}: {
  state: EClipCollectionExportState | undefined;
  exportInfo?: IExportInfo;
}) {
  if (state === EClipCollectionExportState.EXPORTING && !exportInfo) {
    return <div className={styles.stateTag}>Something went wrong</div>;
  }

  switch (state) {
    case EClipCollectionExportState.EXPORTING:
      return (
        <div className={styles.stateTag}>
          <p style={{ margin: 0 }}>
            {exportInfo?.cancelRequested ? (
              <span>{$t('Canceling...')}</span>
            ) : (
              <span>{$t('Exporting video...')}</span>
            )}
          </p>
          <p style={{ margin: 0 }}>
            {Math.round((exportInfo!.currentFrame / exportInfo!.totalFrames) * 100) || 0}%
          </p>
        </div>
      );
    case EClipCollectionExportState.EXPORTED:
      return (
        <div className={styles.stateTag}>
          <i className="icon-check" />
        </div>
      );
    case EClipCollectionExportState.ERROR:
      return (
        <div className={styles.stateTag}>
          <i className="icon-close" /> <p style={{ margin: 0 }}>Error</p>
        </div>
      );
    case EClipCollectionExportState.QUEUED:
      return (
        <div className={styles.stateTag}>
          <i className="icon-time" /> <p style={{ margin: 0 }}>Queued </p>
        </div>
      );
    default:
      return <div></div>;
  }
}

function ThumbnailMedia({
  collectionInfo,
  clipThumbnail,
}: {
  collectionInfo?: IClipCollection;
  clipThumbnail?: string;
}) {
  if (collectionInfo?.clipCollectionInfo.thumbnailUrl) {
    return (
      <img
        style={
          collectionInfo?.clipCollectionInfo.aspectRatio === EOrientation.HORIZONTAL
            ? { objectPosition: 'left' }
            : { objectPosition: `-${(SCRUB_WIDTH * 1.32) / 3 + 4}px` }
        }
        src={collectionInfo?.clipCollectionInfo.thumbnailUrl}
      />
    );
  }

  if (collectionInfo?.collectionExportInfo?.exportedFilePath) {
    return (
      <video
        controls
        width={'100%'}
        height={'100%'}
        src={collectionInfo?.collectionExportInfo?.exportedFilePath}
      ></video>
    );
  }

  if (clipThumbnail) {
    return (
      <img
        style={
          collectionInfo?.clipCollectionInfo.aspectRatio === EOrientation.HORIZONTAL
            ? { objectPosition: 'left' }
            : { objectPosition: `-${(SCRUB_WIDTH * 1.32) / 3 + 4}px` }
        }
        src={clipThumbnail}
      />
    );
  }

  return <div>No thumbnail available</div>;
}
