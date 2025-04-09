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

export default function ClipsViewModal({
  streamId,
  modal,
  onClose,
  deleteClip,
}: {
  streamId: string | undefined;
  modal: { modal: TModalClipsView; inspectedPathId?: string } | null;
  onClose: () => void;
  deleteClip: (clipPath: string, streamId: string | undefined) => void;
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
        {
          trim: '60%',
          preview: '700px',
          export: 'fit-content',
          remove: '400px',
        }[modal],
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
      {inspectedClip && showModal === 'trim' && <ClipTrimmer clip={inspectedClip} />}
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
      {inspectedClip && showModal === 'remove' && (
        <RemoveClip
          close={closeModal}
          clip={inspectedClip}
          streamId={streamId}
          deleteClip={deleteClip}
        />
      )}
    </Modal>
  );
}

function RemoveClip(p: {
  clip: TClip;
  streamId: string | undefined;
  close: () => void;
  deleteClip: (clipPath: string, streamId: string | undefined) => void;
}) {
  const { HighlighterService } = Services;

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>{$t('Remove the clip?')}</h2>
      <p>
        {$t(
          'Are you sure you want to remove the clip? You will need to manually import it again to reverse this action.',
        )}
      </p>
      <Button style={{ marginRight: 8 }} onClick={p.close}>
        {$t('Cancel')}
      </Button>
      <Button
        type="primary"
        danger
        onClick={() => {
          HighlighterService.actions.removeClip(p.clip.path, p.streamId);
          p.deleteClip(p.clip.path, p.streamId);
          p.close();
        }}
      >
        {$t('Remove')}
      </Button>
    </div>
  );
}
