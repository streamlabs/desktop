import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import React, { useEffect, useState } from 'react';
import { TModalClipsView } from './ClipsView';
import { TClip } from 'services/highlighter/models/highlighter.models';
import styles from './StreamView.m.less';
import ClipTrimmer from 'components-react/highlighter/ClipTrimmer';
import { Modal, Alert, Button, Input } from 'antd';
import ExportModal from 'components-react/highlighter/Export/ExportModal';
import { $t } from 'services/i18n';
import PreviewModal from './PreviewModal';
import TextArea from 'antd/lib/input/TextArea';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';

export type TModalStreamCard =
  | 'export'
  | 'preview'
  | 'remove'
  | 'requirements'
  | 'feedback'
  // | { type: 'feedback'; game?: string; id: string | undefined; clipsLength?: number }
  | null;

export default function StreamCardModal({
  streamId,
  modal,
  onClose,
}: {
  streamId: string | undefined;
  modal: TModalStreamCard | null;
  onClose: () => void;
}) {
  console.log('rerender streamCard modal', modal);

  const { HighlighterService } = Services;
  const v = useVuex(() => ({
    exportInfo: HighlighterService.views.exportInfo,
    uploadInfo: HighlighterService.views.uploadInfo,
    error: HighlighterService.views.error,
  }));
  const [showModal, rawSetShowModal] = useState<TModalStreamCard | null>('export');
  const [modalWidth, setModalWidth] = useState('700px');

  useEffect(() => {
    if (modal) {
      console.log('setShowModal', modal);

      setShowModal(modal);
    }
  }, [modal]);

  function setShowModal(modal: TModalStreamCard | null) {
    rawSetShowModal(modal);
    console.log('set modal', modal);

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
  function closeModal() {
    // Do not allow closing export modal while export/upload operations are in progress
    if (v.exportInfo.exporting) return;
    if (v.uploadInfo.some(u => u.uploading)) return;

    setShowModal(null);
    onClose();
    if (v.error) HighlighterService.actions.dismissError();
  }

  return (
    <Modal
      getContainer={`.${styles.streamViewRoot}`}
      onCancel={closeModal}
      footer={null}
      width={modalWidth}
      closable={false}
      visible={!!showModal || !!v.error}
      destroyOnClose={true}
      keyboard={false}
    >
      {!!v.error && <Alert message={v.error} type="error" showIcon />}
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
      {showModal === 'remove' && <RemoveStream close={closeModal} streamId={streamId} />}
      {showModal === 'feedback' && <Feedback streamId={streamId} close={closeModal} />}
    </Modal>
  );
}

function RemoveStream(p: { streamId: string | undefined; close: () => void }) {
  const { HighlighterService } = Services;

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>{$t('Delete highlighted stream?')} </h2>
      <p>
        {$t(
          'Are you sure you want to delete this stream and all its associated clips? This action cannot be undone.',
        )}
      </p>
      <Button style={{ marginRight: 8 }} onClick={p.close}>
        {$t('Cancel')}
      </Button>
      <Button
        type="primary"
        danger
        onClick={() => {
          if (p.streamId === undefined) {
            console.error('Cant remove stream, missing id');
            return;
          }
          HighlighterService.actions.removeStream(p.streamId);
          p.close();
        }}
      >
        {'Delete'}
      </Button>
    </div>
  );
}

function Feedback(p: { streamId: string | undefined; close: () => void }) {
  const { UsageStatisticsService, HighlighterService } = Services;

  const game = HighlighterService.getGameByStreamId(p.streamId);
  const clipAmount = HighlighterService.getClips(HighlighterService.views.clips, p.streamId).length;

  const { TextArea } = Input;
  const [feedback, setFeedback] = useState('');

  const leaveFeedback = () => {
    if (!feedback || feedback.length > 140) {
      return;
    }

    UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'ThumbsDownFeedback',
      streamId: p.streamId,
      game,
      clips: clipAmount,
      feedback,
    });

    close();
  };

  return (
    <div>
      <TextArea
        rows={4}
        maxLength={140}
        showCount
        placeholder={$t('Highlights not working? Let us know how we can improve.')}
        onChange={e => setFeedback(e.target.value)}
      />
      <div style={{ textAlign: 'right', marginTop: '24px' }}>
        <Button
          size="large"
          type="primary"
          style={{ marginTop: '14px' }}
          disabled={!feedback}
          onClick={leaveFeedback}
        >
          {$t('Submit')}
        </Button>
      </div>
    </div>
  );
}
