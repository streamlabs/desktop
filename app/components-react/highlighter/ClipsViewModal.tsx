import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import React, { useEffect, useState } from 'react';
import { TModalClipsView } from './ClipsView';
import { TClip } from 'services/highlighter/models/highlighter.models';
import styles from './ClipsView.m.less';
import ClipTrimmer from 'components-react/highlighter/ClipTrimmer';
import { Modal, Alert, Button } from 'antd';
import ExportModal from 'components-react/highlighter/Export/ExportModal';
import { $t } from 'services/i18n';
import PreviewModal from './PreviewModal';
import RemoveModal from './RemoveModal';
import ExportMarkersModal from './ExportMarkersModal';

export default function ClipsViewModal({
  streamId,
  modal,
  onClose,
  deleteClip,
}: {
  streamId: string | undefined;
  modal: { modal: TModalClipsView; inspectedPathId?: string } | null;
  onClose: () => void;
  deleteClip: (clipPath: string[], streamId: string | undefined) => void;
}) {
  const { HighlighterService } = Services;
  const v = useVuex(() => ({
    exportInfo: HighlighterService.views.exportInfo,
    uploadInfo: HighlighterService.views.uploadInfo,
    error: HighlighterService.views.error,
  }));
  const [showModal, rawSetShowModal] = useState<TModalClipsView | null>(null);
  const [modalWidth, setModalWidth] = useState('700px');
  const [inspectedClip, setInspectedClip] = useState<TClip | null>(null);

  useEffect(() => {
    if (modal?.inspectedPathId) {
      setInspectedClip(HighlighterService.views.clipsDictionary[modal.inspectedPathId]);
    }
    if (modal?.modal) {
      setShowModal(modal.modal);
    }
  }, [modal]);

  function setShowModal(modal: TModalClipsView | null) {
    rawSetShowModal(modal);

    if (modal) {
      setModalWidth(
        ({
          trim: '60%',
          preview: '700px',
          export: 'fit-content',
          remove: '280px',
          exportMarkers: 'fit-content',
        } as Record<string, string>)[modal] ?? '700px',
      );
    }
  }
  function closeModal() {
    // Do not allow closing export modal while export/upload operations are in progress
    if (v.exportInfo.exporting) return;
    if (v.uploadInfo.some(u => u.uploading)) return;

    setInspectedClip(null);
    setShowModal(null);
    onClose();
    if (v.error) HighlighterService.actions.dismissError();
  }

  return (
    <Modal
      getContainer={`.${styles.clipsViewRoot}`}
      onCancel={closeModal}
      footer={null}
      width={modalWidth}
      closable={false}
      visible={!!showModal || !!v.error}
      destroyOnClose={true}
      keyboard={false}
    >
      {!!v.error && <Alert message={v.error} type="error" showIcon />}
      {inspectedClip && showModal === 'trim' && (
        <ClipTrimmer clip={inspectedClip} streamId={streamId} />
      )}
      {showModal === 'export' && <ExportModal close={closeModal} streamId={streamId} />}
      {showModal === 'preview' && (
        <PreviewModal
          close={closeModal}
          streamId={streamId}
          emitSetShowModal={modal => {
            setShowModal(modal);
          }}
        />
      )}
      {showModal === 'exportMarkers' && streamId && (
        <ExportMarkersModal close={closeModal} streamId={streamId} />
      )}
      {inspectedClip && showModal === 'remove' && (
        <RemoveModal
          key={`remove-${inspectedClip.path}`}
          close={closeModal}
          clip={inspectedClip}
          streamId={streamId}
          deleteClip={deleteClip}
          removeType={'clip'}
        />
      )}
    </Modal>
  );
}
