import { useVuex } from 'components-react/hooks';
import React, { useEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './StreamView.m.less';
import cx from 'classnames';
import {
  EHighlighterView,
  IStreamInfoForAiHighlighter,
  IViewState,
  TOpenedFrom,
} from 'services/highlighter/models/highlighter.models';
import { Modal, Button, Alert } from 'antd';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import Scrollable from 'components-react/shared/Scrollable';
import { $t } from 'services/i18n';
import path from 'path';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { ImportStreamModal } from './ImportStream';
import SupportedGames from './supportedGames/SupportedGames';
import MigrationNotice from './migration/MigrationNotice';

type TModalStreamView = {
  type: 'upload';
  path?: string;
  game?: EGame;
  streamInfo?: IStreamInfoForAiHighlighter;
  openedFrom: TOpenedFrom;
} | null;

export default function StreamView({ emitSetView }: { emitSetView: (data: IViewState) => void }) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const v = useVuex(() => ({
    error: HighlighterService.views.error,
    uploadInfo: HighlighterService.views.uploadInfo,
    tempRecordingInfoPath: HighlighterService.views.tempRecordingInfo.recordingPath,
  }));

  useEffect(() => {
    const recordingInfo = { ...HighlighterService.views.tempRecordingInfo };
    HighlighterService.setTempRecordingInfo({});

    if (recordingInfo.recordingPath && recordingInfo.source) {
      setShowModal({
        type: 'upload',
        path: recordingInfo.recordingPath,
        streamInfo: recordingInfo.streamInfo,
        openedFrom: recordingInfo.source,
      });
    }
  }, [v.tempRecordingInfoPath]);

  const [showModal, rawSetShowModal] = useState<TModalStreamView | null>(null);

  function setShowModal(modal: TModalStreamView | null) {
    rawSetShowModal(modal);
  }

  function closeModal() {
    // Do not allow closing export modal while export/upload operations are in progress
    if (v.uploadInfo.some(u => u.uploading)) return;

    setShowModal(null);

    if (v.error) HighlighterService.actions.dismissError();
  }

  // This should also open the ImportStreamModal
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    const extensions = SUPPORTED_FILE_TYPES.map(e => `.${e}`);
    const files: string[] = [];
    let fi = e.dataTransfer.files.length;
    while (fi--) {
      const file = e.dataTransfer.files.item(fi)?.path;
      if (file) files.push(file);
    }

    const filtered = files.filter(f => extensions.includes(path.parse(f).ext));
    if (filtered.length) {
      setShowModal({ type: 'upload', path: filtered[0], openedFrom: 'manual-import' });
    }

    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      className={cx(styles.streamViewWrapper, showModal && styles.importModalRoot)}
      onDrop={event => onDrop(event)}
    >
      <div style={{ display: 'flex', padding: 20 }}>
        <div style={{ flexGrow: 1 }}>
          <h1 style={{ margin: 0 }}>{$t('My Stream Highlights')}</h1>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div
            className={styles.uploadWrapper}
            onClick={() => setShowModal({ type: 'upload', openedFrom: 'manual-import' })}
          >
            <div onClick={e => e.stopPropagation()}>
              <SupportedGames
                emitClick={game => {
                  setShowModal({ type: 'upload', game, openedFrom: 'manual-import' });
                }}
              />
            </div>
            {$t('Select your game recording')}
            <Button>{$t('Import')}</Button>
          </div>
          <Button onClick={() => emitSetView({ view: EHighlighterView.SETTINGS })}>
            {$t('Settings')}
          </Button>
        </div>
      </div>

      <Scrollable style={{ flexGrow: 1, padding: '20px 0 20px 20px' }}>
        <MigrationNotice
          variant="page"
          onShowAllClips={() => {
            emitSetView({ view: EHighlighterView.CLIPS });
          }}
        />
      </Scrollable>

      <Modal
        getContainer={`.${styles.importModalRoot}`}
        onCancel={() => {
          if (showModal?.type === 'upload') {
            UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
              type: 'DetectionModalCanceled',
              openedFrom: showModal.openedFrom,
              streamId: showModal.streamInfo?.id,
            });
          }

          closeModal();
        }}
        footer={null}
        width={'fit-content'}
        closable={false}
        visible={!!showModal}
        destroyOnClose={true}
        keyboard={false}
        transitionName=""
        maskTransitionName=""
      >
        {!!v.error && <Alert message={v.error} type="error" showIcon />}
        {showModal?.type === 'upload' && (
          <ImportStreamModal
            close={closeModal}
            videoPath={showModal.path}
            selectedGame={showModal.game}
            streamInfo={showModal.streamInfo}
            openedFrom={showModal.openedFrom}
          />
        )}
      </Modal>
    </div>
  );
}
