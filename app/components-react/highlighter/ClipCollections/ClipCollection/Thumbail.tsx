import { Services } from 'components-react/service-provider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EClipCollectionExportState,
  EClipCollectionUploadState,
  IClipCollection,
  IClipCollectionClip,
} from 'services/highlighter/clip-collections';
import { SCRUB_WIDTH } from 'services/highlighter/constants';
import { EOrientation } from 'services/highlighter/models/ai-highlighter.models';
import cx from 'classnames';
import styles from './ClipCollection.m.less';
import { IExportInfo } from 'services/highlighter/models/rendering.models';
import { $t } from 'services/i18n';
import { IUploadInfo } from 'services/highlighter/models/highlighter.models';

export default function Thumbnail({
  collectionInfo,
  emitSetModal,
}: {
  collectionInfo?: IClipCollection;
  emitSetModal: (modal: any) => void;
}) {
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
          exportState={collectionInfo?.collectionExportInfo?.state}
          exportInfo={collectionInfo?.collectionExportInfo?.exportInfo}
          uploadState={collectionInfo?.collectionUploadInfo?.state}
          uploadInfo={collectionInfo?.collectionUploadInfo?.uploadInfo}
          emitSetModal={emitSetModal}
        />
      )}
      <ThumbnailMedia collectionInfo={collectionInfo} clipThumbnail={clipThumbnail} />
    </div>
  );
}

function StateTag({
  exportState,
  exportInfo,
  uploadState,
  uploadInfo,
  emitSetModal,
}: {
  exportState: EClipCollectionExportState | undefined;
  exportInfo?: IExportInfo;
  uploadState: EClipCollectionUploadState | undefined;
  uploadInfo?: IUploadInfo;
  emitSetModal: (modal: any) => void;
}) {
  if (!exportState && !uploadState) {
    return <DeleteButton emitSetModal={modal => emitSetModal(modal)} />;
  }
  if (uploadState && uploadInfo) {
    switch (uploadState) {
      case EClipCollectionUploadState.UPLOADING:
        return ProcessTag(
          'upload',
          uploadInfo?.uploadedBytes || 0,
          uploadInfo?.totalBytes || 0,
          uploadInfo?.cancelRequested || false,
        );
      case EClipCollectionUploadState.QUEUED:
        return QueuedTag('Posting');

      case EClipCollectionUploadState.ERROR:
        return (
          <div className={styles.stateTag}>
            <i className="icon-close" /> <p style={{ margin: 0 }}>Error</p>
          </div>
        );
      default:
        return <DeleteButton emitSetModal={modal => emitSetModal(modal)} />;
    }
  }

  if (exportState === EClipCollectionExportState.EXPORTING && !exportInfo) {
    return <div className={styles.stateTag}>Something went wrong</div>;
  }

  switch (exportState) {
    case EClipCollectionExportState.EXPORTING:
      if (!exportInfo) {
        <div className={styles.stateTag}>
          <i className="icon-close" /> <p style={{ margin: 0 }}>Error</p>
        </div>;
      }
      return ProcessTag(
        'export',
        exportInfo?.currentFrame || 0,
        exportInfo?.totalFrames || 0,
        exportInfo?.cancelRequested || false,
      );

    case EClipCollectionExportState.ERROR:
      return (
        <div className={styles.stateTag}>
          <i className="icon-close" /> <p style={{ margin: 0 }}>Error</p>
        </div>
      );
    case EClipCollectionExportState.QUEUED:
      return QueuedTag('Export');
    default:
      return <DeleteButton emitSetModal={modal => emitSetModal(modal)} />;
  }
}

function DeleteButton({ emitSetModal }: { emitSetModal: (modal: any) => void }) {
  return (
    <div
      className={cx(styles.stateTag, styles.deleteTag)}
      onClick={() => {
        emitSetModal('delete');
      }}
    >
      <i className="icon-trash" />
    </div>
  );
}

function QueuedTag(string: 'Posting' | 'Export') {
  return (
    <div className={styles.stateTag}>
      <i className="icon-time" /> <p style={{ margin: 0 }}> {string} queued </p>
    </div>
  );
}

function ProcessTag(
  type: 'upload' | 'export',
  currentValue: number,
  totalValue: number,
  cancelRequested: boolean,
) {
  return (
    <div className={styles.stateTag}>
      <p style={{ margin: 0 }}>
        {cancelRequested ? (
          <span>{$t('Canceling...')}</span>
        ) : (
          <span>{type === 'export' ? 'Exporting...' : 'Posting...'}</span>
        )}
      </p>
      <p style={{ margin: 0 }}>{Math.round((currentValue / totalValue) * 100) || 0}%</p>
    </div>
  );
}

function ThumbnailMedia({
  collectionInfo,
  clipThumbnail,
}: {
  collectionInfo?: IClipCollection;
  clipThumbnail?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!showControls) return;
    videoRef.current?.play();
  }, [showControls]);

  if (videoRef.current) {
    if (showControls) {
      videoRef.current.volume = 1;
    } else {
      videoRef.current.volume = 0;
    }
  }

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
        ref={videoRef}
        controls={showControls}
        width={'100%'}
        height={'100%'}
        src={collectionInfo?.collectionExportInfo?.exportedFilePath}
        onMouseEnter={() => !showControls && videoRef.current && videoRef.current.play()}
        onMouseLeave={() => !showControls && videoRef.current && videoRef.current.pause()}
        onClick={() => {
          setShowControls(true);
        }}
        style={{ cursor: showControls ? 'default' : 'pointer' }}
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
