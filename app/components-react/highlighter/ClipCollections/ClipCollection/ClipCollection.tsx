import React, { useEffect, useMemo, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { IViewState, TClip } from 'services/highlighter/models/highlighter.models';
import { TModalStreamCard } from '../../StreamCardModal';
import { fileExists } from 'services/highlighter/file-utils';
import { Button } from 'antd';
import { IClipCollectionClip } from 'services/highlighter/clip-collections';
import ClipCollectionModal from './ClipCollectionModal';

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

  const clipsArray = v.clipCollection?.clips ? Object.values(v.clipCollection.clips) : [];

  return (
    <div style={{ width: '400px', height: '400px', backgroundColor: 'blue' }}>
      state: {v.clipCollection.collectionExportInfo?.state} | currFrame:{' '}
      {v.clipCollection.collectionExportInfo?.exportInfo?.currentFrame}
      imagePath: {v.clipCollection.collectionExportInfo?.exportedFilePath}
      <div style={{ overflow: 'hidden', height: '264px', width: '100%' }}>
        <Thumbnail
          clips={clipsArray}
          generatedThumbnail=""
          exportedFilePath={v.clipCollection.collectionExportInfo?.exportedFilePath}
        />
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

function Thumbnail({
  exportedFilePath,
  clips,
  generatedThumbnail,
}: {
  exportedFilePath?: string;
  clips?: IClipCollectionClip[];
  generatedThumbnail?: string;
}) {
  const { HighlighterService } = Services;
  const firstClip = useMemo(() => {
    if (!clips || clips.length === 0) return undefined;
    return clips.reduce((lowest, current) =>
      current.collectionOrderPosition < lowest.collectionOrderPosition ? current : lowest,
    );
  }, [clips]);

  const clipThumbnail =
    HighlighterService.views.clipsDictionary[firstClip?.clipId || '']?.scrubSprite;

  if (generatedThumbnail) {
    return (
      <div>
        <img src={generatedThumbnail} />
      </div>
    );
  }

  if (exportedFilePath) {
    return (
      <div>
        <video src={exportedFilePath}></video>
      </div>
    );
  }

  if (clipThumbnail) {
    return (
      <div style={{ position: 'relative', overflowX: 'clip', width: 192, height: 108 }}>
        <img src={clipThumbnail}></img>
      </div>
    );
  }

  return <div>No thumbnail available</div>;
}
