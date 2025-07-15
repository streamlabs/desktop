import { Modal } from 'antd';
import ExportModal from 'components-react/highlighter/Export/ExportModal';
import { TModalStreamCard } from 'components-react/highlighter/StreamCardModal';
import { Services } from 'components-react/service-provider';
import React, { useState, useEffect } from 'react';
import { TClip } from 'services/highlighter/models/highlighter.models';
import styles from '../../StreamView.m.less';
import { TStreamClipSuggestionsModal } from './Header';
import CollectionUpload from '../Upload/CollectionUpload';

export default function StreamClipSuggestionModal({
  modal,
  clips,
  collectionIds,
  onClose,
}: {
  modal: TStreamClipSuggestionsModal;
  clips: TClip[];
  collectionIds: string[];
  onClose: () => void;
}) {
  const { HighlighterService } = Services;
  const [showModal, rawSetShowModal] = useState<TStreamClipSuggestionsModal>(null);
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

  function setShowModal(modal: TStreamClipSuggestionsModal) {
    rawSetShowModal(modal);
    if (modal) {
      setModalWidth(
        {
          post: '1000px',
          export: 'fit-content',
          // remove: '400px',
          // requirements: 'fit-content',
          // feedback: '700px',
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

      {showModal === 'post' && (
        <CollectionUpload close={closeModal} collectionIds={collectionIds} />
      )}
      {/* {showModal === 'remove' && <RemoveStream close={closeModal} streamId={streamId} />}
    {showModal === 'feedback' && <Feedback streamId={streamId} close={closeModal} game={game} />}
    {showModal === 'requirements' && <EducationCarousel game={game} />} */}
    </Modal>
  );
}
