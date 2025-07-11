import { Modal, Alert, Button, Input } from 'antd';
import PreviewModal from '../../PreviewModal';
import { IClipCollectionClip } from 'services/highlighter/clip-collections';
import { fileExists } from 'services/highlighter/file-utils';
import ExportModal from '../../Export/ExportModal';
import React, { useState, useEffect } from 'react';
import { TClip } from 'services/highlighter/models/highlighter.models';
import { TModalStreamCard } from '../../StreamCardModal';
import { Services } from 'components-react/service-provider';
import styles from '../../StreamView.m.less';

export default function ClipCollectionModal({
  modal,
  clips,
  collectionId,
  onClose,
}: {
  modal: TModalStreamCard;
  clips: TClip[];
  collectionId: string;
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
    // Do not allow closing export modal while export/upload operations are in progress
    // if (v.exportInfo.exporting) return;
    // if (v.uploadInfo.some(u => u.uploading)) return;

    setShowModal(null);
    onClose();
    // if (v.error) HighlighterService.actions.dismissError();
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
      collectionId: {collectionId}
      {/* {!!v.error && <Alert message={v.error} type="error" showIcon />} */}
      {showModal === 'export' && (
        <ExportModal close={closeModal} streamId={undefined} clipCollectionIds={[collectionId]} />
      )}
      {showModal === 'preview' && (
        <PreviewModal
          close={closeModal}
          collectionId={collectionId}
          emitSetShowModal={modal => {
            setShowModal(modal);
          }}
          streamId={undefined}
          clips={clips}
        />
      )}
      {/* {showModal === 'remove' && <RemoveStream close={closeModal} streamId={streamId} />}
    {showModal === 'feedback' && <Feedback streamId={streamId} close={closeModal} game={game} />}
    {showModal === 'requirements' && <EducationCarousel game={game} />} */}
    </Modal>
  );
}
