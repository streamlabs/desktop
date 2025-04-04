import { useVuex } from 'components-react/hooks';
import React, { useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './StreamView.m.less';
import {
  EHighlighterView,
  IStreamInfoForAiHighlighter,
  IViewState,
} from 'services/highlighter/models/highlighter.models';
import isEqual from 'lodash/isEqual';
import { Modal, Button, Alert } from 'antd';
import ExportModal from 'components-react/highlighter/Export/ExportModal';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import Scrollable from 'components-react/shared/Scrollable';
import { $t } from 'services/i18n';
import * as remote from '@electron/remote';
import uuid from 'uuid';
import StreamCard from './StreamCard';
import path from 'path';
import PreviewModal from './PreviewModal';
import moment from 'moment';
import { TextInput } from 'components-react/shared/inputs';
import EducationCarousel from './EducationCarousel';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';

type TModalStreamView =
  | { type: 'export'; id: string | undefined }
  | { type: 'preview'; id: string | undefined }
  | { type: 'upload' }
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

  // Below is only used because useVueX doesnt work as expected
  // there probably is a better way to do this
  const currentStreams = useRef<{ id: string; date: string }[]>();
  const highlightedStreams = useVuex(() => {
    const newStreamIds = [
      ...HighlighterService.views.highlightedStreams.map(stream => {
        return { id: stream.id, date: stream.date };
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

  function ImportStreamModal({ close }: { close: () => void }) {
    const { HighlighterService } = Services;
    const [inputValue, setInputValue] = useState<string>('');

    function handleInputChange(value: string) {
      setInputValue(value);
    }

    function specialCharacterValidator(rule: unknown, value: string, callback: Function) {
      if (/[\\/:"*?<>|]+/g.test(value)) {
        callback($t('You cannot use special characters in this field'));
      } else {
        callback();
      }
    }

    async function startAiDetection(title: string) {
      if (/[\\/:"*?<>|]+/g.test(title)) return;
      const streamInfo: IStreamInfoForAiHighlighter = {
        id: 'manual_' + uuid(),
        title,
        game: EGame.FORTNITE,
      };

      let filePath: string[] | undefined = [];

      try {
        filePath = await importStreamFromDevice();
        if (filePath && filePath.length > 0) {
          HighlighterService.actions.detectAndClipAiHighlights(filePath[0], streamInfo);
          close();
        } else {
          // No file selected
        }
      } catch (error: unknown) {
        console.error('Error importing file from device', error);
      }
    }

    return (
      <>
        <div className={styles.manualUploadWrapper}>
          <div className={styles.titleInputWrapper}>
            <h1 style={{ margin: 0 }}> {$t('Import Fortnite Stream')}</h1>
            <TextInput
              value={inputValue}
              name="name"
              placeholder={$t('Set a title for your stream')}
              onChange={handleInputChange}
              style={{ width: '100%', color: 'black' }}
              rules={[{ validator: specialCharacterValidator }]}
              nowrap
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
            <Button type="default" onClick={() => close()}>
              {$t('Cancel')}
            </Button>
            <Button type="primary" onClick={() => startAiDetection(inputValue)}>
              {$t('Select video to start import')}
            </Button>
          </div>
        </div>
      </>
    );
  }

  async function importStreamFromDevice() {
    const selections = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
      properties: ['openFile'],
      filters: [{ name: $t('Video Files'), extensions: SUPPORTED_FILE_TYPES }],
    });

    if (selections && selections.filePaths) {
      return selections.filePaths;
    }
  }

  function closeModal() {
    // Do not allow closing export modal while export/upload operations are in progress
    if (v.exportInfo.exporting) return;
    if (v.uploadInfo.some(u => u.uploading)) return;

    setShowModal(null);

    if (v.error) HighlighterService.actions.dismissError();
  }

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
    if (filtered.length) {
      const StreamInfoForAiHighlighter: IStreamInfoForAiHighlighter = {
        id: 'manual_' + uuid(),
        game: EGame.FORTNITE,
      };
      HighlighterService.actions.detectAndClipAiHighlights(filtered[0], StreamInfoForAiHighlighter);
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
              onClick={() => !aiDetectionInProgress && setShowModal({ type: 'upload' })}
            >
              <FortniteIcon />
              {$t('Select your Fortnite recording')}
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
                          setShowModal({ type: 'requirements', game: 'fortnite' });
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
        onCancel={closeModal}
        footer={null}
        width={showModal?.type === 'preview' ? 700 : 'fit-content'}
        closable={false}
        visible={!!showModal}
        destroyOnClose={true}
        keyboard={false}
      >
        {!!v.error && <Alert message={v.error} type="error" showIcon />}
        {showModal?.type === 'upload' && v.highlighterVersion !== '' && (
          <ImportStreamModal close={closeModal} />
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
        {showModal?.type === 'requirements' && <EducationCarousel />}
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

export function groupStreamsByTimePeriod(streams: { id: string; date: string }[]) {
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

function FortniteIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_2722_18907)">
        <rect width="28" height="28" rx="2" fill="white" />
        <rect width="28" height="28" fill="url(#paint0_linear_2722_18907)" />
        <path
          d="M10.3438 13.9981C10.3438 18.9588 10.3561 23.0156 10.3725 23.0156C10.3971 23.0156 13.7399 22.3981 14.15 22.3163L14.3633 22.2754V18.9628V15.6544H15.6348H16.9063V15.0491C16.9063 14.7178 16.9186 13.8549 16.935 13.127L16.9596 11.8102H15.6635H14.3633V10.3583V8.90654H15.8604C16.6848 8.90654 17.3574 8.89836 17.3574 8.88609C17.3574 8.84111 17.6856 5.3486 17.7061 5.17275L17.7307 4.98054H14.0352H10.3438V13.9981Z"
          fill="white"
        />
      </g>
      <defs>
        <linearGradient
          id="paint0_linear_2722_18907"
          x1="2.94562e-08"
          y1="-0.52973"
          x2="15.0944"
          y2="34.3755"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#168FD8" />
          <stop offset="0.205" stopColor="#3CA2E4" />
          <stop offset="0.500584" stopColor="#75CDF1" />
          <stop offset="1" stopColor="#6AE1FB" />
        </linearGradient>
        <clipPath id="clip0_2722_18907">
          <rect width="28" height="28" rx="2" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
