import { useVuex } from 'components-react/hooks';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './StreamView.m.less';
import * as remote from '@electron/remote';
import cx from 'classnames';
import {
  EHighlighterView,
  IStreamInfoForAiHighlighter,
  IViewState,
  TOpenedFrom,
} from 'services/highlighter/models/highlighter.models';
import isEqual from 'lodash/isEqual';
import { Modal, Button, Alert, Input } from 'antd';
import ExportModal from 'components-react/highlighter/Export/ExportModal';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import Scrollable from 'components-react/shared/Scrollable';
import { $t } from 'services/i18n';
import uuid from 'uuid';
import StreamCard from './StreamCard';
import path from 'path';
import PreviewModal from './PreviewModal';
import moment from 'moment';
import { TextInput } from 'components-react/shared/inputs';
import EducationCarousel from './EducationCarousel';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { ImportStreamModal } from './ImportStream';
import SupportedGames from './supportedGames/SupportedGames';
import StreamClipCollections from './ClipCollections/StreamClipSuggestions';

type TModalStreamView = {
  type: 'upload';
  path?: string;
  game?: EGame;
  streamInfo?: IStreamInfoForAiHighlighter;
  openedFrom: TOpenedFrom;
} | null;

export default function NewStreamView({
  emitSetView,
}: {
  emitSetView: (data: IViewState) => void;
}) {
  console.log('🫟 NewStreamView rendered');

  const { HighlighterService, HotkeysService, UsageStatisticsService } = Services;
  const v = useVuex(() => ({
    error: HighlighterService.views.error,
    uploadInfo: HighlighterService.views.uploadInfo,
    highlighterVersion: HighlighterService.views.highlighterVersion,
    tempRecordingInfoPath: HighlighterService.views.tempRecordingInfo.recordingPath,
    streamLength: HighlighterService.views.highlightedStreamsDictionary.length,
  }));
  const streams = HighlighterService.views.highlightedStreamsDictionary;

  const sortedStreamIds = Object.keys(streams)
    .map(streamId => ({ streamId, streamDate: streams[streamId].date }))
    .sort((a, b) => new Date(b.streamDate).getTime() - new Date(a.streamDate).getTime());

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

  // Below is only used because useVueX doesnt work as expected
  // there probably is a better way to do this
  const highlightedStreamsAmount = useVuex(() => {
    return HighlighterService.views.highlightedStreams.length;
  });

  const currentAiDetectionState = useRef<boolean>();

  const aiDetectionInProgress = useVuex(() => {
    const newDetectionInProgress = HighlighterService.views.highlightedStreams.some(
      stream => stream.state.type === 'detection-in-progress',
    );

    if (
      currentAiDetectionState.current === undefined ||
      !isEqual(currentAiDetectionState.current, newDetectionInProgress)
    ) {
      currentAiDetectionState.current = newDetectionInProgress;
    }
    return currentAiDetectionState.current;
  });

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
    if (v.highlighterVersion === '') return;

    const extensions = SUPPORTED_FILE_TYPES.map(e => `.${e}`);
    const files: string[] = [];
    let fi = e.dataTransfer.files.length;
    while (fi--) {
      const file = e.dataTransfer.files.item(fi)?.path;
      if (file) files.push(file);
    }

    const filtered = files.filter(f => extensions.includes(path.parse(f).ext));
    if (filtered.length && !aiDetectionInProgress) {
      setShowModal({ type: 'upload', path: filtered[0], openedFrom: 'manual-import' });
    }

    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      className={cx(
        styles.streamViewWrapper,
        showModal && styles.importModalRoot,
        styles.streamCardModalRoot,
      )}
      onDrop={event => onDrop(event)}
    >
      <div style={{ display: 'flex', padding: 20 }}>
        <div style={{ flexGrow: 1 }}>
          <h1 style={{ margin: 0 }}>{$t('My Stream Highlights')}</h1>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          {v.highlighterVersion !== '' && (
            <div
              className={styles.uploadWrapper}
              style={{
                opacity: aiDetectionInProgress ? '0.7' : '1',
                cursor: aiDetectionInProgress ? 'not-allowed' : 'pointer',
              }}
              onClick={() =>
                !aiDetectionInProgress &&
                setShowModal({ type: 'upload', openedFrom: 'manual-import' })
              }
            >
              <div onClick={e => e.stopPropagation()}>
                <SupportedGames
                  emitClick={game => {
                    !aiDetectionInProgress &&
                      setShowModal({ type: 'upload', game, openedFrom: 'manual-import' });
                  }}
                />
              </div>
              {$t('Select your game recording')}
              <Button disabled={aiDetectionInProgress === true}>{$t('Import')}</Button>
            </div>
          )}
          <Button onClick={() => emitSetView({ view: EHighlighterView.SETTINGS })}>
            {$t('Settings')}
          </Button>
        </div>
      </div>

      <Scrollable style={{ flexGrow: 1, padding: '20px 0 20px 20px' }}>
        sortedIds length: {sortedStreamIds.length}
        {sortedStreamIds &&
          sortedStreamIds.map(({ streamId }) => {
            return (
              <React.Fragment key={streamId}>
                <StreamClipCollections
                  streamId={streamId}
                  emitSetView={emitSetView}
                ></StreamClipCollections>
              </React.Fragment>
            );
          })}
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
      >
        {!!v.error && <Alert message={v.error} type="error" showIcon />}
        {showModal?.type === 'upload' && v.highlighterVersion !== '' && (
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

export function groupStreamsByStreamId(streams: { id: string; streamId: string }[]) {
  const groups: { [streamId: string]: typeof streams } = {};

  streams.forEach(stream => {
    if (!groups[stream.streamId]) {
      groups[stream.streamId] = [];
    }
    groups[stream.streamId].push(stream);
  });

  return groups;
}
