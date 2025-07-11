import React, { useState, useEffect, useMemo } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import ClipCollection from './ClipCollection';
import {
  EHighlighterView,
  IHighlightedStream,
  isAiClip,
  IViewState,
  TClip,
} from 'services/highlighter/models/highlighter.models';
import styles from '../StreamView.m.less';
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
    <div style={{ width: '100%', backgroundColor: '#f0f2f5' }}>
      <Header
        streamInfo={streamInfo}
        emitSetView={props.emitSetView}
        clips={clips}
        clipCollectionIds={clipCollectionIds}
      ></Header>
      <ClipCollectionRow clipCollectionIds={clipCollectionIds}></ClipCollectionRow>
    </div>
  );
}

function Header({
  streamInfo,
  clips,
  clipCollectionIds,
  emitSetView,
}: {
  streamInfo: IHighlightedStream;
  clips: TClip[];
  clipCollectionIds: string[];
  emitSetView: (data: IViewState) => void;
}) {
  console.log('🎨: Header');

  const { HighlighterService } = Services;
  const [modal, setModal] = useState<TModalStreamCard | null>(null);

  return (
    <div style={{ width: '100%', backgroundColor: 'red' }}>
      <StreamClipSuggestionModal
        collectionIds={clipCollectionIds}
        modal={modal}
        clips={clips}
        onClose={() => {
          setModal(null);
        }}
      />
      header {streamInfo.game} state: {JSON.stringify(streamInfo.state)}
      clipos: {clips.length}
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
            setModal('export');
            // clipCollectionIds.forEach(collectionId => {
            //   HighlighterService.actions.queueExportClipCollection(collectionId);
            // });
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

import { Modal, Alert, Button, Input } from 'antd';
import PreviewModal from '../PreviewModal';
import { IClipCollectionClip } from 'services/highlighter/clip-collections';
import { fileExists } from 'services/highlighter/file-utils';
import ExportModal from '../Export/ExportModal';
import { TModalStreamCard } from '../StreamCardModal';

function StreamClipSuggestionModal({
  modal,
  clips,
  collectionIds,
  onClose,
}: {
  modal: TModalStreamCard;
  clips: TClip[];
  collectionIds: string[];
  onClose: () => void;
}) {
  const { HighlighterService } = Services;
  const [showModal, rawSetShowModal] = useState<TModalStreamCard | null>(null);
  const [modalWidth, setModalWidth] = useState('700px');
  useEffect(() => {
    if (modal) {
      setShowModal(modal);
    }
  }, [modal]);

  function closeModal() {
    setShowModal(null);
    onClose();
  }

  function setShowModal(modal: TModalStreamCard | null) {
    rawSetShowModal(modal);
    if (modal) {
      setModalWidth(
        {
          preview: '700px',
          export: 'fit-content',
          remove: '400px',
          requirements: 'fit-content',
          feedback: '700px',
        }[modal],
      );
    }
  }
  return (
    <Modal
      getContainer={`.${styles.streamCardModalRoot}`}
      onCancel={closeModal}
      footer={null}
      width={modalWidth}
      closable={false}
      // visible={!!showModal || !!v.error}
      visible={!!showModal}
      destroyOnClose={true}
      keyboard={false}
    >
      {/* {!!v.error && <Alert message={v.error} type="error" showIcon />} */}
      {showModal === 'export' && (
        <ExportModal close={closeModal} streamId={undefined} clipCollectionIds={collectionIds} />
      )}
      {/* {showModal === 'remove' && <RemoveStream close={closeModal} streamId={streamId} />}
    {showModal === 'feedback' && <Feedback streamId={streamId} close={closeModal} game={game} />}
    {showModal === 'requirements' && <EducationCarousel game={game} />} */}
    </Modal>
  );
}
