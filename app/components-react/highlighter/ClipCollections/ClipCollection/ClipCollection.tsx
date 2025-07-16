import React, { useEffect, useMemo, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import {
  EUploadPlatform,
  IUploadInfo,
  IViewState,
  TClip,
} from 'services/highlighter/models/highlighter.models';
import { TModalStreamCard } from '../../StreamCardModal';
import { fileExists } from 'services/highlighter/file-utils';
import { Button } from 'antd';
import * as remote from '@electron/remote';
import {
  EClipCollectionExportState,
  EClipCollectionUploadState,
  IClipCollection,
  IClipCollectionClip,
} from 'services/highlighter/clip-collections';
import ClipCollectionModal from './ClipCollectionModal';
import Thumbnail from './Thumbail';
import styles from './ClipCollection.m.less';
import { IExportInfo } from 'services/highlighter/models/rendering.models';

interface ClipCollectionProps {
  collectionId: string;
  emitDeletedCollection: (id: string) => void;
}

export default function ClipCollection(props: ClipCollectionProps) {
  console.log('ClipCollection rendered', props.collectionId);

  const [modal, setModal] = useState<TModalStreamCard | null>(null);

  const { HighlighterService } = Services;
  const v = useVuex(() => ({
    clipCollection: HighlighterService.views.clipCollectionsDictionary[props.collectionId],
  }));

  if (!v.clipCollection) {
    return <div>Collection not found</div>;
  }

  if (
    v.clipCollection.collectionExportInfo?.exportedFilePath &&
    fileExists(v.clipCollection.collectionExportInfo?.exportedFilePath) === false
  ) {
    HighlighterService.clipCollectionManager.updateCollection({
      id: v.clipCollection.id,
      collectionExportInfo: {
        ...v.clipCollection.collectionExportInfo,
        exportedFilePath: undefined,
        state: undefined,
      },
    });
  }

  const clips = HighlighterService.clipCollectionManager.getClipsFromCollection(props.collectionId);

  return (
    <div className={styles.card}>
      <div style={{ width: '100%' }}>
        <Thumbnail
          collectionInfo={v.clipCollection}
          emitSetModal={modal => {
            // Only modal right now is delete
            // so delete
            props.emitDeletedCollection(v.clipCollection.id);
            HighlighterService.clipCollectionManager.deleteCollection(v.clipCollection.id);
          }}
        />
        <div
          style={{ height: '58px', width: '100%', alignItems: 'center', display: 'flex' }}
          className={styles.title}
        >
          <h3 style={{ margin: 0, lineHeight: '18px' }}>
            {v.clipCollection.clipCollectionInfo.title || 'Collection Title'}
          </h3>
        </div>
      </div>
      <ClipCollectionModal
        collectionId={v.clipCollection.id}
        modal={modal}
        clips={clips}
        onClose={() => {
          setModal(null);
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <CollectionCta collection={v.clipCollection} emitSetModal={modal => setModal(modal)} />
      </div>
    </div>
  );
}

function CollectionCta({
  collection,
  emitSetModal,
}: {
  collection: IClipCollection;
  emitSetModal: (modal: TModalStreamCard) => void;
}) {
  console.log('CollectionCta rendered', collection.id);

  const platform = EUploadPlatform.YOUTUBE;
  const { HighlighterService } = Services;
  const state = latestState(collection, platform);
  const uploadedFileUrl = collection.collectionUploadInfo?.[platform]?.uploadedFileUrl;

  const exportState = collection.collectionExportInfo?.state;
  const exportInfo = collection.collectionExportInfo?.exportInfo;

  const uploadInfo = collection.collectionUploadInfo?.[platform]?.uploadInfo;
  const uploadState = collection.collectionUploadInfo?.[platform]?.state;

  function openLink(link: string) {
    remote.shell.openExternal(link);
  }

  switch (state) {
    case 'exported':
      return (
        <PostingCtas
          collection={collection}
          uploadState={uploadState}
          uploadInfo={uploadInfo}
          emitSetModal={emitSetModal}
        />
      );

    case 'posted':
      return (
        <Button
          color="primary"
          onClick={() => {
            if (!uploadedFileUrl) return;
            openLink(uploadedFileUrl);
          }}
        >
          Open
        </Button>
      );
    default:
      return (
        <ExportCtas exportState={exportState} exportInfo={exportInfo} emitSetModal={emitSetModal} />
      );
  }
}
function ExportCtas({
  exportState,
  exportInfo,
  emitSetModal,
}: {
  exportState: EClipCollectionExportState | undefined;
  exportInfo: IExportInfo | undefined;
  emitSetModal: (modal: TModalStreamCard) => void;
}) {
  console.log('ExportCtas rendered', exportState, exportInfo);

  switch (exportState) {
    case EClipCollectionExportState.EXPORTING:
      if (!exportInfo) {
        <Button
          danger
          onClick={() => {
            //todo reset function
          }}
        >
          Error
        </Button>;
      }
      return progressCta(
        'export',
        exportInfo?.currentFrame || 0,
        exportInfo?.totalFrames || 0,
        exportInfo?.cancelRequested || false,
      );

    case EClipCollectionExportState.ERROR:
      return (
        <Button
          danger
          onClick={() => {
            //todo reset function
          }}
        >
          Export error
        </Button>
      );
    case EClipCollectionExportState.QUEUED:
      return (
        <Button
          disabled
          style={{ width: '100%', backgroundColor: '#BCC1C3', color: 'black' }}
          onClick={() => {
            // emitSetModal('export');
            // add un-queue functionality on hover
          }}
        >
          Export queued
        </Button>
      );
    default:
      return (
        <Button
          style={{ width: '100%', backgroundColor: 'white', color: 'black' }}
          onClick={() => {
            emitSetModal('export');
          }}
        >
          Export
        </Button>
      );
  }
}

function PostingCtas({
  collection,
  uploadState,
  uploadInfo,
  emitSetModal,
}: {
  collection: IClipCollection;
  uploadState: EClipCollectionUploadState | undefined;
  uploadInfo: IUploadInfo | undefined;
  emitSetModal: (modal: TModalStreamCard) => void;
}) {
  const { HighlighterService } = Services;

  switch (uploadState) {
    case EClipCollectionUploadState.UPLOADING:
      if (!uploadInfo) {
        <Button
          danger
          onClick={() => {
            //todo reset function
          }}
        >
          Error
        </Button>;
      }
      return progressCta(
        'upload',
        uploadInfo?.uploadedBytes || 0,
        uploadInfo?.totalBytes || 0,
        uploadInfo?.cancelRequested || false,
      );

    case EClipCollectionUploadState.ERROR:
      return (
        <Button
          danger
          onClick={() => {
            //todo reset function
          }}
        >
          Error
        </Button>
      );
    case EClipCollectionUploadState.QUEUED:
      return (
        <Button
          disabled
          style={{ width: '100%', backgroundColor: '#BA8C56', color: 'black' }}
          onClick={() => {
            // emitSetModal('export');
            // add un-queue functionality on hover
          }}
        >
          Post queued
        </Button>
      );
    default:
      return (
        <Button
          color="yello"
          style={{ width: '100%', backgroundColor: '#FFBE72', color: 'black' }}
          onClick={() => {
            // TODO: M needs to be passed via modal
            // emitSetModal('post');
            HighlighterService.clipCollectionManager.uploadClipCollection(collection.id);
          }}
        >
          Post
        </Button>
      );
  }
}

function progressCta(
  type: 'upload' | 'export',
  currentValue: number,
  totalValue: number,
  cancelRequested: boolean,
) {
  const progressBarColor = type === 'export' ? '#E3E8EB' : '#E0A968';
  const backgroundColor = type === 'export' ? '#ffffff' : '#FFBE72';

  return (
    <div className={styles.progressbarBackground} style={{ backgroundColor }}>
      <div className={styles.progressbarText}>
        <span>{type === 'export' ? 'Exporting... ' : 'Posting... '}</span>
        <span>{Math.round((currentValue / totalValue) * 100) || 0}%</span>
      </div>
      <div
        className={styles.progressbarProgress}
        style={{
          // opacity: currentValue / totalValue < 1 ? 0 : 1,
          transform: `scaleX(${currentValue / totalValue})`,
          transformOrigin: 'left',
          transition: 'transform 1000ms',
          backgroundColor: progressBarColor,
        }}
      ></div>
      {/* 
      <Button
        size="small"
        className={styles.cancelButton}
        style={{ backgroundColor }}
        onClick={e => {
          e.stopPropagation();
          // cancelHighlightGeneration();
        }}
      >
        <i className="icon-close" />
      </Button> */}
    </div>
  );
}

function latestState(
  clipCollectionInfo: IClipCollection,
  platform: EUploadPlatform,
): 'exported' | 'posted' | undefined {
  if (
    clipCollectionInfo.collectionUploadInfo?.[platform]?.state ===
    EClipCollectionUploadState.UPLOADED
  ) {
    return 'posted';
  }

  if (clipCollectionInfo.collectionExportInfo?.state === 'exported') {
    return 'exported';
  }

  return undefined;
}
