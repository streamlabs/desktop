import React, { useEffect, useMemo, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { IViewState, TClip } from 'services/highlighter/models/highlighter.models';
import { TModalStreamCard } from '../../StreamCardModal';
import { fileExists } from 'services/highlighter/file-utils';
import { Button } from 'antd';
import { IClipCollectionClip } from 'services/highlighter/clip-collections';
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
      <div style={{ overflow: 'hidden', height: '264px', width: '100%' }}>
        <Thumbnail collectionInfo={v.clipCollection} />
      </div>
      <Button
        onClick={() => {
          props.emitDeletedCollection(v.clipCollection.id);
          HighlighterService.clipCollectionManager.deleteCollection(v.clipCollection.id);
        }}
      >
        delete COllection
      </Button>
      <ClipCollectionModal
        collectionId={v.clipCollection.id}
        modal={modal}
        clips={clips}
        onClose={() => {
          setModal(null);
        }}
      />
      <Button
        onClick={() => {
          setModal('preview');
        }}
      >
        Preview
      </Button>
    </div>
  );
}
