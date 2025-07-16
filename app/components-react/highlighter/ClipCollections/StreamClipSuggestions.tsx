import React, { useState, useEffect, useMemo } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import ClipCollection from './ClipCollection/ClipCollection';
import {
  EHighlighterView,
  IHighlightedStream,
  isAiClip,
  IViewState,
  TClip,
} from 'services/highlighter/models/highlighter.models';
import Header from './Header/Header';
import { EAiDetectionState } from 'services/highlighter/models/ai-highlighter.models';

interface StreamClipCollectionsProps {
  streamId: string;
  emitSetView: (data: IViewState) => void;
}

export default function StreamClipCollections(props: StreamClipCollectionsProps) {
  const { HighlighterService } = Services;
  const streamInfo = useVuex(
    () => HighlighterService.views.highlightedStreamsDictionary[props.streamId],
  );

  const clips = useMemo(() => {
    return HighlighterService.views.clips
      .filter(c => c.streamInfo?.[props.streamId])
      .map(clip => {
        if (isAiClip(clip) && (clip.aiInfo as any).moments) {
          clip.aiInfo.inputs = (clip.aiInfo as any).moments;
        }
        return clip;
      });
  }, [
    HighlighterService.views.clips.filter(clips => clips.streamInfo?.[props.streamId]),
    props.streamId,
  ]);
  const clipCollectionIds = streamInfo?.clipCollectionIds || [];

  return (
    <div
      style={{
        width: '100%',
        paddingBottom: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Header
        streamInfo={streamInfo}
        emitSetView={props.emitSetView}
        clips={clips}
        clipCollectionIds={clipCollectionIds}
      ></Header>
      {streamInfo.state.type === EAiDetectionState.IN_PROGRESS ? (
        <DetectionInProgress streamInfo={streamInfo}></DetectionInProgress>
      ) : (
        <ClipCollectionRow clipCollectionIds={clipCollectionIds}></ClipCollectionRow>
      )}
    </div>
  );
}

function DetectionInProgress({ streamInfo }: { streamInfo: IHighlightedStream }) {
  return (
    <div
      style={{
        padding: 16,
        backgroundColor: '#f0f2f5',
        textAlign: 'center',
        height: '400px',
        width: '100%',
      }}
    >
      placeholder coming soon state: {streamInfo.state.type}
      progress: {streamInfo.state.progress}
    </div>
  );
}

function ClipCollectionRow({ clipCollectionIds }: { clipCollectionIds: string[] }) {
  console.log('🎨: ClipCollectionRow', clipCollectionIds);
  const { HighlighterService } = Services;
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
