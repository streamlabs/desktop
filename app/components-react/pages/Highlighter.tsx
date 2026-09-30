import React, { useEffect, useState } from 'react';
import cx from 'classnames';
import { Alert, Modal } from 'antd';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import ClipsView from 'components-react/highlighter/ClipsView';
import ReplaySection from 'components-react/highlighter/ReplaySection';
import ManualCaptureSection from 'components-react/highlighter/ManualCaptureSection';
import { ImportStreamModal } from 'components-react/highlighter/ImportStream';
import importStyles from 'components-react/highlighter/ImportStream.m.less';
import {
  IStreamInfoForAiHighlighter,
  TOpenedFrom,
} from 'services/highlighter/models/highlighter.models';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { $t } from 'services/i18n';

type TImportModal = {
  path?: string;
  game?: EGame;
  streamInfo?: IStreamInfoForAiHighlighter;
  openedFrom: TOpenedFrom;
} | null;

export default function Highlighter() {
  const { HighlighterService, UsageStatisticsService } = Services;
  // Replay only exists on Windows
  const showReplay = HighlighterService.aiHighlighterFeatureEnabled;

  const v = useVuex(() => ({
    error: HighlighterService.views.error,
    uploadInfo: HighlighterService.views.uploadInfo,
    tempRecordingInfoPath: HighlighterService.views.tempRecordingInfo.recordingPath,
  }));

  const [importModal, setImportModal] = useState<TImportModal>(null);

  useEffect(() => {
    UsageStatisticsService.recordShown('HighlighterTab');
  }, []);

  // A recording handed over from elsewhere (after a stream, or the recordings tab) opens the
  // import modal right away
  useEffect(() => {
    const recordingInfo = { ...HighlighterService.views.tempRecordingInfo };
    HighlighterService.setTempRecordingInfo({});

    if (recordingInfo.recordingPath && recordingInfo.source) {
      setImportModal({
        path: recordingInfo.recordingPath,
        streamInfo: recordingInfo.streamInfo,
        openedFrom: recordingInfo.source,
      });
    }
  }, [v.tempRecordingInfoPath]);

  function closeImportModal() {
    // Do not allow closing while upload operations are in progress
    if (v.uploadInfo.some(u => u.uploading)) return;

    setImportModal(null);

    if (v.error) HighlighterService.actions.dismissError();
  }

  return (
    <div
      className={cx(importModal && importStyles.importModalRoot)}
      // The page container is a flex row: without flex-grow the page shrinks to its content's
      // width, which is zero once the Replay section is hidden (Mac)
      style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%' }}
    >
      <ClipsView>
        {showReplay && (
          <ReplaySection onImport={() => setImportModal({ openedFrom: 'manual-import' })} />
        )}
        <ManualCaptureSection
          title={showReplay ? $t('Or capture clips manually') : $t('Capture clips manually')}
        />
      </ClipsView>

      <Modal
        getContainer={`.${importStyles.importModalRoot}`}
        onCancel={() => {
          if (importModal) {
            UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
              type: 'DetectionModalCanceled',
              openedFrom: importModal.openedFrom,
              streamId: importModal.streamInfo?.id,
            });
          }

          closeImportModal();
        }}
        footer={null}
        width={'fit-content'}
        closable={false}
        visible={!!importModal}
        destroyOnClose={true}
        keyboard={false}
        transitionName=""
        maskTransitionName=""
      >
        {!!v.error && <Alert message={v.error} type="error" showIcon />}
        {importModal && (
          <ImportStreamModal
            close={closeImportModal}
            videoPath={importModal.path}
            selectedGame={importModal.game}
            streamInfo={importModal.streamInfo}
            openedFrom={importModal.openedFrom}
          />
        )}
      </Modal>
    </div>
  );
}
