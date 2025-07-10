import React, { useState, useEffect } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import ClipCollection from './ClipCollection';
import {
  EHighlighterView,
  IHighlightedStream,
  IViewState,
} from 'services/highlighter/models/highlighter.models';
import { Button } from 'antd';
import { HighlighterService } from 'app-services';

interface StreamClipCollectionsProps {
  streamId: string;
  emitSetView: (data: IViewState) => void;
}

export default function StreamClipCollections(props: StreamClipCollectionsProps) {
  const { HighlighterService } = Services;
  const streamInfo = useVuex(
    () => HighlighterService.views.highlightedStreamsDictionary[props.streamId],
  );
  const clipCollectionIds = streamInfo?.clipCollectionIds || [];

  return (
    <div style={{ width: '100%', backgroundColor: '#f0f2f5' }}>
      <Header streamInfo={streamInfo} emitSetView={props.emitSetView}></Header>
      <ClipCollectionRow clipCollectionIds={clipCollectionIds}></ClipCollectionRow>
    </div>
  );
}

function Header({
  streamInfo,
  emitSetView,
}: {
  streamInfo: IHighlightedStream;
  emitSetView: (data: IViewState) => void;
}) {
  console.log('🎨: Header');

  const { HighlighterService } = Services;
  return (
    <div style={{ width: '100%', backgroundColor: 'red' }}>
      header {streamInfo.game}{' '}
      <Button
        onClick={() => {
          emitSetView({ view: EHighlighterView.CLIPS, id: streamInfo.id });
        }}
      >
        show clips
      </Button>
      <Button
        onClick={() => {
          const clipCollectionIds = HighlighterService.clipCollectionManager.getClipCollectionsByStreamId(
            streamInfo.id,
          );

          if (clipCollectionIds) {
            clipCollectionIds.forEach(collectionId => {
              HighlighterService.actions.queueExportClipCollection(collectionId);
            });
          }
        }}
      >
        Export all clips
      </Button>
    </div>
  );
}

function ClipCollectionRow({ clipCollectionIds }: { clipCollectionIds: string[] }) {
  console.log('🎨: ClipCollectionRow', clipCollectionIds);

  const [collectionIds, setCollectionIds] = useState(clipCollectionIds);

  // Sync local state with props when they change
  useEffect(() => {
    setCollectionIds(clipCollectionIds);
  }, [clipCollectionIds]);

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {collectionIds.map(collectionId => {
        return (
          <ClipCollection
            key={collectionId}
            collectionId={collectionId}
            emitDeletedCollection={deletedId =>
              setCollectionIds(collectionIds.filter(collectionId => collectionId !== deletedId))
            }
          ></ClipCollection>
        );
      })}
    </div>
  );
}
