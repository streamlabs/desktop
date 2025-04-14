import { useVuex } from 'components-react/hooks';
import React, { useEffect, useRef, useState } from 'react';
import styles from './StreamView.m.less';
import { Services } from 'components-react/service-provider';
import {
  EHighlighterView,
  IStreamInfoForAiHighlighter,
  IViewState,
  TOpenedFrom,
} from 'services/highlighter/models/highlighter.models';
import isEqual from 'lodash/isEqual';
import { Modal, Button, Alert } from 'antd';
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

type TModalStreamView =
  | { type: 'export'; id: string | undefined }
  | { type: 'preview'; id: string | undefined }
  | {
      type: 'upload';
      path?: string;
      game?: EGame;
      streamInfo?: IStreamInfoForAiHighlighter;
      openedFrom: TOpenedFrom;
    }
  | { type: 'remove'; id: string | undefined }
  | { type: 'requirements'; game: string }
  | null;

export default function StreamView({ emitSetView }: { emitSetView: (data: IViewState) => void }) {
  const { HighlighterService, HotkeysService, UsageStatisticsService } = Services;
  const v = useVuex(() => ({
    exportInfo: HighlighterService.views.exportInfo,
    error: HighlighterService.views.error,
    uploadInfo: HighlighterService.views.uploadInfo,
    highlighterVersion: HighlighterService.views.highlighterVersion,
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
  }, []);

  // Below is only used because useVueX doesnt work as expected
  // there probably is a better way to do this
  const currentStreams = useRef<{ id: string; date: string; game: string }[]>();
  const highlightedStreams = useVuex(() => {
    const newStreamIds = [
      ...HighlighterService.views.highlightedStreams.map(stream => {
        return { id: stream.id, date: stream.date, game: stream.game };
      }),
    ];

    if (currentStreams.current === undefined || !isEqual(currentStreams.current, newStreamIds)) {
      currentStreams.current = newStreamIds;
    }
    return currentStreams.current.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
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
  const [clipsOfStreamAreLoading, setClipsOfStreamAreLoading] = useState<string | null>(null);

  function setShowModal(modal: TModalStreamView | null) {
    rawSetShowModal(modal);
  }

  async function previewVideo(id: string) {
    setClipsOfStreamAreLoading(id);

    try {
      await HighlighterService.actions.return.loadClips(id);
      setClipsOfStreamAreLoading(null);
      rawSetShowModal({ type: 'preview', id });
    } catch (error: unknown) {
      console.error('Error loading clips for preview export', error);
      setClipsOfStreamAreLoading(null);
    }
  }

  async function exportVideo(id: string) {
    setClipsOfStreamAreLoading(id);

    try {
      await HighlighterService.actions.return.loadClips(id);
      setClipsOfStreamAreLoading(null);
      rawSetShowModal({ type: 'export', id });
    } catch (error: unknown) {
      console.error('Error loading clips for export', error);
      setClipsOfStreamAreLoading(null);
    }
  }

  function closeModal() {
    // Do not allow closing export modal while export/upload operations are in progress
    if (v.exportInfo.exporting) return;
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
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
      className={styles.streamViewRoot}
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
        {highlightedStreams.length === 0 ? (
          <>No highlight clips created from streams</> // TODO: Add empty state
        ) : (
          Object.entries(groupStreamsByTimePeriod(highlightedStreams)).map(
            ([period, streams]) =>
              streams.length > 0 && (
                <React.Fragment key={period}>
                  <div className={styles.periodDivider}>{period}</div>
                  <div className={styles.streamcardsWrapper}>
                    {streams.map(stream => (
                      <StreamCard
                        key={stream.id}
                        streamId={stream.id}
                        emitSetView={data => emitSetView(data)}
                        emitGeneratePreview={() => previewVideo(stream.id)}
                        emitExportVideo={() => exportVideo(stream.id)}
                        emitRemoveStream={() => setShowModal({ type: 'remove', id: stream.id })}
                        clipsOfStreamAreLoading={clipsOfStreamAreLoading}
                        emitCancelHighlightGeneration={() => {
                          HighlighterService.actions.cancelHighlightGeneration(stream.id);
                        }}
                        emitShowRequirements={() => {
                          setShowModal({ type: 'requirements', game: stream.game });
                        }}
                      />
                    ))}
                  </div>
                </React.Fragment>
              ),
          )
        )}
      </Scrollable>

      <Modal
        getContainer={`.${styles.streamViewRoot}`}
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
        width={showModal?.type === 'preview' ? 700 : 'fit-content'}
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
        {showModal?.type === 'export' && <ExportModal close={closeModal} streamId={showModal.id} />}
        {showModal?.type === 'preview' && (
          <PreviewModal
            close={closeModal}
            streamId={showModal.id}
            emitSetShowModal={modal => {
              if (modal === 'export') {
                rawSetShowModal({ type: 'export', id: showModal.id });
              }
            }}
          />
        )}
        {showModal?.type === 'remove' && (
          <RemoveStream close={closeModal} streamId={showModal.id} />
        )}
        {showModal?.type === 'requirements' && <EducationCarousel game={showModal.game} />}
      </Modal>
    </div>
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

export function groupStreamsByTimePeriod(streams: { id: string; date: string; game: string }[]) {
  const now = moment();
  const groups: { [key: string]: typeof streams } = {
    Today: [],
    Yesterday: [],
    'This week': [],
    'Last week': [],
    'This month': [],
    'Last month': [],
  };
  const monthGroups: { [key: string]: typeof streams } = {};

  streams.forEach(stream => {
    const streamDate = moment(stream.date);
    if (streamDate.isSame(now, 'day')) {
      groups['Today'].push(stream);
    } else if (streamDate.isSame(now.clone().subtract(1, 'day'), 'day')) {
      groups['Yesterday'].push(stream);
    } else if (streamDate.isSame(now, 'week')) {
      groups['This week'].push(stream);
    } else if (streamDate.isSame(now.clone().subtract(1, 'week'), 'week')) {
      groups['Last week'].push(stream);
    } else if (streamDate.isSame(now, 'month')) {
      groups['This month'].push(stream);
    } else if (streamDate.isSame(now.clone().subtract(1, 'month'), 'month')) {
      groups['Last month'].push(stream);
    } else {
      const monthKey = streamDate.format('MMMM YYYY');
      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = [];
      }
      monthGroups[monthKey].push(stream);
    }
  });

  return { ...groups, ...monthGroups };
}
