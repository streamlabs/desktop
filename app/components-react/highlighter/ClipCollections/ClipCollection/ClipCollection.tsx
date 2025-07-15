import React, { useEffect, useMemo, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { EUploadPlatform, IViewState, TClip } from 'services/highlighter/models/highlighter.models';
import { TModalStreamCard } from '../../StreamCardModal';
import { fileExists } from 'services/highlighter/file-utils';
import { Button } from 'antd';
import * as remote from '@electron/remote';
import {
  EClipCollectionUploadState,
  IClipCollection,
  IClipCollectionClip,
} from 'services/highlighter/clip-collections';
import ClipCollectionModal from './ClipCollectionModal';
import Thumbnail from './Thumbail';
import styles from './ClipCollection.m.less';

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
          style={{ height: '38px', width: '100%', alignItems: 'center', display: 'flex' }}
          className={styles.title}
        >
          <h3 style={{ margin: 0 }}>
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
  const platform = EUploadPlatform.YOUTUBE;
  const { HighlighterService } = Services;
  const state = latestState(collection, platform);
  const uploadedFileUrl = collection.collectionUploadInfo?.[platform]?.uploadedFileUrl;

  function openLink(link: string) {
    remote.shell.openExternal(link);
  }
  switch (state) {
    case 'exported':
      return (
        <Button
          style={{ width: '100%', backgroundColor: 'orange', color: 'white' }}
          onClick={() => {
            if (!collection.collectionExportInfo?.exportedFilePath) {
              console.warn('Cant post: No exported file path found for collection', collection.id);
              return;
            }
            HighlighterService.actions.queueUploadClipCollection(collection.id);
            // TODO: open posting moda;
            // emitSetModal('export');
          }}
        >
          Post clip
        </Button>
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
        <Button
          style={{ width: '100%', backgroundColor: 'red', color: 'white' }}
          onClick={() => {
            emitSetModal('export');
          }}
        >
          Export
        </Button>
      );
  }
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
