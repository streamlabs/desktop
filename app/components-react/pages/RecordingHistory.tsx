import React, { useEffect, useMemo } from 'react';
import cx from 'classnames';
import * as remote from '@electron/remote';
import { Tooltip } from 'antd';
import { $t } from 'services/i18n';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import styles from './RecordingHistory.m.less';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import { GetSLID } from 'components-react/highlighter/StorageUpload';
import { ENotificationType } from 'services/notifications';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from '../service-provider';
import { initStore, useController } from '../hooks/zustand';
import { useVuex } from '../hooks';
import Translate from 'components-react/shared/Translate';
import uuid from 'uuid/v4';
import { EMenuItemKey } from 'services/side-nav';
import { $i } from 'services/utils';
import { IRecordingEntry } from 'services/recording-mode';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { EAiDetectionState, EGame } from 'services/highlighter/models/ai-highlighter.models';
import { EHighlighterView } from 'services/highlighter/models/highlighter.models';

interface IRecordingHistoryStore {
  showSLIDModal: boolean;
  showEditModal: boolean;
  fileEdited: IRecordingEntry | null;
}

const RecordingHistoryCtx = React.createContext<RecordingHistoryController | null>(null);

class RecordingHistoryController {
  private RecordingModeService = Services.RecordingModeService;
  private UserService = Services.UserService;
  private SharedStorageService = Services.SharedStorageService;
  private NotificationsService = Services.NotificationsService;
  private HighlighterService = Services.HighlighterService;
  private NavigationService = Services.NavigationService;
  private IncrementalRolloutService = Services.IncrementalRolloutService;
  store = initStore<IRecordingHistoryStore>({
    showSLIDModal: false,
    showEditModal: false,
    fileEdited: null,
  });

  get recordings() {
    return this.RecordingModeService.views.sortedRecordings;
  }

  get hasYoutube() {
    return this.UserService.views.linkedPlatforms.includes('youtube');
  }

  get hasSLID() {
    return !!this.UserService.views.auth?.slid?.id;
  }

  get uploadInfo() {
    return this.RecordingModeService.state.uploadInfo;
  }

  get aiDetectionInProgress() {
    return this.HighlighterService.views.highlightedStreams.some(
      stream => stream.state.type === EAiDetectionState.IN_PROGRESS,
    );
  }

  get highlighterVersion() {
    return this.HighlighterService.views.highlighterVersion;
  }

  get uploadOptions() {
    const opts = [
      {
        label: `${$t('Get highlights (Fortnite only)')}`,
        value: 'highlighter',
        icon: 'icon-highlighter',
      },
      {
        label: $t('Edit'),
        value: 'edit',
        icon: 'icon-trim',
      },
      {
        label: '',
        value: 'remove',
        icon: 'icon-trash',
      },
    ];
    if (this.hasYoutube) {
      opts.unshift({
        label: $t('Upload'),
        value: 'youtube',
        icon: 'icon-youtube',
      });
    }

    return opts;
  }

  get editOptions() {
    return [
      {
        value: 'videoeditor',
        label: 'Video Editor',
        description: $t('Edit video professionally from your browser with Video Editor'),
        src: 'video-editor.png',
      },
      {
        value: 'crossclip',
        label: 'Cross Clip',
        description: $t(
          'Turn your videos into mobile-friendly short-form TikToks, Reels, and Shorts with Cross Clip',
        ),
        src: 'crossclip.png',
      },
      {
        value: 'typestudio',
        label: 'Podcast Edtior',
        description: $t('Polish your videos with text-based and AI powered Podcast Editor'),
        src: 'podcast-editor.png',
      },
    ];
  }

  postError(message: string) {
    this.NotificationsService.actions.push({
      message,
      type: ENotificationType.WARNING,
      lifeTime: 5000,
    });
  }

  handleSelect(recording: IRecordingEntry, platform: string) {
    if (this.uploadInfo.uploading) {
      this.postError($t('Upload already in progress'));
      return;
    }
    if (platform === 'highlighter') {
      if (this.aiDetectionInProgress) return;
      this.HighlighterService.actions.detectAndClipAiHighlights(recording.filename, {
        game: EGame.FORTNITE,
        id: 'rec_' + uuid(),
      });
      this.NavigationService.actions.navigate(
        'Highlighter',
        { view: EHighlighterView.STREAM },
        EMenuItemKey.Highlighter,
      );
      return;
    }

    if (platform === 'youtube') return this.uploadToYoutube(recording.filename);
    if (platform === 'remove') return this.removeEntry(recording.timestamp);
    if (this.hasSLID) {
      this.store.setState(s => {
        s.showEditModal = true;
        s.fileEdited = recording;
      });
    } else {
      this.store.setState(s => {
        s.showSLIDModal = true;
      });
    }
  }

  formattedTimestamp(timestamp: string) {
    return this.RecordingModeService.views.formattedTimestamp(timestamp);
  }

  async uploadToYoutube(filename: string) {
    const id = await this.RecordingModeService.actions.return.uploadToYoutube(filename);
    if (!id) return;
    remote.shell.openExternal(`https://youtube.com/watch?v=${id}`);
  }

  async uploadToStorage(filename: string, platform: string) {
    const id = await this.RecordingModeService.actions.return.uploadToStorage(filename, platform);
    if (!id) return;
    remote.shell.openExternal(this.SharedStorageService.views.getPlatformLink(platform, id));
  }

  removeEntry(timestamp: string) {
    this.RecordingModeService.actions.removeRecordingEntry(timestamp);
  }

  showFile(filename: string) {
    remote.shell.showItemInFolder(filename);
  }

  cancelUpload() {
    this.RecordingModeService.actions.cancelUpload();
  }
}

export default function RecordingHistoryPage() {
  const controller = useMemo(() => new RecordingHistoryController(), []);
  return (
    <RecordingHistoryCtx.Provider value={controller}>
      <RecordingHistory />
    </RecordingHistoryCtx.Provider>
  );
}

export function RecordingHistory() {
  const controller = useController(RecordingHistoryCtx);
  const { formattedTimestamp, showFile, handleSelect, postError } = controller;
  const aiHighlighterFeatureEnabled = Services.IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.aiHighlighter,
  );
  const {
    uploadInfo,
    uploadOptions,
    recordings,
    hasSLID,
    aiDetectionInProgress,
    highlighterVersion,
  } = useVuex(() => ({
    recordings: controller.recordings,
    aiDetectionInProgress: controller.aiDetectionInProgress,
    uploadOptions: controller.uploadOptions,
    uploadInfo: controller.uploadInfo,
    hasSLID: controller.hasSLID,
    highlighterVersion: controller.highlighterVersion,
  }));

  useEffect(() => {
    let isMounted = true;

    if (
      uploadInfo.error &&
      typeof uploadInfo.error === 'string' &&
      !/TypeError/.test(uploadInfo.error)
    ) {
      if (isMounted) {
        postError(uploadInfo.error);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [uploadInfo.error]);

  function openMarkersSettings() {
    Services.SettingsService.actions.showSettings('Hotkeys');
  }

  function UploadActions(p: { recording: IRecordingEntry }) {
    return (
      <span className={styles.actionGroup}>
        {uploadOptions
          .map(option => {
            if (
              option.value === 'highlighter' &&
              (!aiHighlighterFeatureEnabled || highlighterVersion === '')
            ) {
              return null;
            }
            return (
              <span
                className={styles.action}
                key={option.value}
                style={{
                  color: `var(--${option.value === 'edit' ? 'teal' : 'title'})`,
                  opacity: option.value === 'highlighter' && aiDetectionInProgress ? 0.3 : 1,
                  cursor:
                    option.value === 'highlighter' && aiDetectionInProgress
                      ? 'not-allowed'
                      : 'pointer',
                }}
                onClick={() => handleSelect(p.recording, option.value)}
              >
                <i className={option.icon} />
                &nbsp;
                <span>{option.label}</span>
              </span>
            );
          })
          .filter(Boolean)}
      </span>
    );
  }

  return (
    <div className={styles.container}>
      <h1>{$t('Recordings')}</h1>
      <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column' }}>
        {$t(
          'Record your screen with Streamlabs Desktop. Once recording is complete, it will be displayed here. Access your files or edit further with Streamlabs tools.',
        )}
        <Translate message="<color>Pro tip:</color> set Markers in Hotkeys settings to timestamp your recordings. <link>Set up here</link>">
          <span slot="color" className={styles.tipHighlight} />
          <a slot="link" onClick={openMarkersSettings} className={styles.tipLink} />
        </Translate>
      </div>
      <div className={styles.recordingsContainer} id="recordingHistory">
        <Scrollable style={{ height: '100%' }}>
          {recordings.map(recording => (
            <div className={styles.recording} key={recording.timestamp}>
              <span style={{ marginRight: '8px' }}>{formattedTimestamp(recording.timestamp)}</span>
              <Tooltip title={$t('Show in folder')}>
                <span
                  data-test="filename"
                  onClick={() => showFile(recording.filename)}
                  className={styles.filename}
                >
                  {recording.filename}
                </span>
              </Tooltip>
              {uploadOptions.length > 0 && <UploadActions recording={recording} />}
            </div>
          ))}
        </Scrollable>
      </div>
      <ExportModal />
      <EditModal />
      {!hasSLID && <SLIDModal />}
    </div>
  );
}

function EditModal() {
  const { store, editOptions, uploadToStorage } = useController(RecordingHistoryCtx);
  const showEditModal = store.useState(s => s.showEditModal);
  const recording = store.useState(s => s.fileEdited);

  function close() {
    store.setState(s => {
      s.showEditModal = false;
      s.fileEdited = null;
    });
  }

  function editFile(platform: string) {
    if (!recording) throw new Error('File not found');

    uploadToStorage(recording.filename, platform);
    close();
  }

  if (!showEditModal) return <></>;

  return (
    <div className={styles.modalBackdrop}>
      <ModalLayout
        hideFooter
        wrapperStyle={{
          width: '750px',
          height: '320px',
        }}
        bodyStyle={{
          width: '100%',
          background: 'var(--section)',
          position: 'relative',
        }}
      >
        <>
          <h2>{$t('Choose how to edit your recording')}</h2>
          <i className={cx('icon-close', styles.closeIcon)} onClick={close} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
            {editOptions.map(editOpt => (
              <div
                className={styles.editCell}
                key={editOpt.value}
                onClick={() => editFile(editOpt.value)}
              >
                <img src={$i(`images/products/${editOpt.src}`)} />
                <span className={styles.editTitle}>{editOpt.label}</span>
                <span>{editOpt.description}</span>
              </div>
            ))}
          </div>
        </>
      </ModalLayout>
    </div>
  );
}

function SLIDModal() {
  const { store } = useController(RecordingHistoryCtx);
  const showSLIDModal = store.useState(s => s.showSLIDModal);

  if (!showSLIDModal) return <></>;

  function loginSuccess() {
    store.setState({ showSLIDModal: false });
  }

  return (
    <div className={styles.modalBackdrop}>
      <ModalLayout
        hideFooter
        wrapperStyle={{
          width: '450px',
          height: '300px',
        }}
        bodyStyle={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <GetSLID onLogin={loginSuccess} />
      </ModalLayout>
    </div>
  );
}

function ExportModal() {
  const { uploadInfo, cancelUpload } = useController(RecordingHistoryCtx);
  const { uploadedBytes, totalBytes } = uploadInfo;

  if (!uploadedBytes || !totalBytes) return <></>;
  return (
    <div className={styles.modalBackdrop}>
      <ModalLayout
        hideFooter
        wrapperStyle={{
          width: '300px',
          height: '100px',
        }}
        bodyStyle={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <AutoProgressBar percent={uploadedBytes / totalBytes} timeTarget={1000 * 60} />
        <button className="button button--default" onClick={cancelUpload}>
          {$t('Cancel')}
        </button>
      </ModalLayout>
    </div>
  );
}
