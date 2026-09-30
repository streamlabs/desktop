import { Button } from 'antd';
import { Services } from 'components-react/service-provider';
import { ListInput, TextInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import * as remote from '@electron/remote';
import {
  HIGHLIGHTER_APP_NAME,
  REPLAY_APP_NAME,
  SUPPORTED_FILE_TYPES,
} from 'services/highlighter/constants';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import {
  IStreamInfoForAiHighlighter,
  TInstalledHighlighterApp,
  TOpenedFrom,
} from 'services/highlighter/models/highlighter.models';
import { $t } from 'services/i18n';
import React, { useEffect, useState } from 'react';
import styles from './ImportStream.m.less';
import { getConfigByGame, supportedGames } from 'services/highlighter/models/game-config.models';
import path from 'path';
import fs from 'fs';
import moment from 'moment';
import ModalInstallationFlow from './ModalInstallationFlow';
import { HypeWrapper } from './HypeWrapper';
import { IRecordingEntry } from 'services/recording-mode';

const RECENT_RECORDINGS_COUNT = 10;

export function ImportStreamModal({
  close,
  openedFrom,
  videoPath,
  selectedGame,
  streamInfo,
  showRecentRecordings,
}: {
  close: () => void;
  openedFrom: TOpenedFrom;
  videoPath?: string;
  selectedGame?: EGame;
  streamInfo?: IStreamInfoForAiHighlighter;
  /** Start with a picker of the latest recordings before the import form */
  showRecentRecordings?: boolean;
}) {
  const { HighlighterService, UsageStatisticsService, RecordingModeService } = Services;
  const [installedApp, setInstalledApp] = useState<TInstalledHighlighterApp | null>(null);

  // Read once on open. Recordings deleted from disk since are left out.
  const [recentRecordings] = useState<IRecordingEntry[]>(() =>
    showRecentRecordings && !videoPath
      ? RecordingModeService.views.sortedRecordings
          .filter(recording => fs.existsSync(recording.filename))
          .slice(0, RECENT_RECORDINGS_COUNT)
      : [],
  );
  const [showingRecordingPicker, setShowingRecordingPicker] = useState(recentRecordings.length > 0);
  const [gameSelectOpen, setGameSelectOpen] = useState(false);
  const [openGameSelectOnShow, setOpenGameSelectOnShow] = useState(false);

  // Opened only after the form is mounted, so the dropdown can attach to the rendered select
  useEffect(() => {
    if (!showingRecordingPicker && openGameSelectOnShow) {
      setGameSelectOpen(true);
      setOpenGameSelectOnShow(false);
    }
  }, [showingRecordingPicker, openGameSelectOnShow]);
  const [showingInstallFlow, setShowingInstallFlow] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    game: EGame;
    filePath: string;
    streamId?: string;
  } | null>(null);

  useEffect(() => {
    HighlighterService.actions.return.getInstalledHighlighterApp().then(app => {
      setInstalledApp(app);
    });
  }, []);

  const [inputValue, setInputValue] = useState<string>(streamInfo?.title || '');
  const [filePath, setFilePath] = useState<string | undefined>(videoPath);
  const [draggingOver, setDraggingOver] = useState<boolean>(false);
  const [game, setGame] = useState<EGame | undefined>(
    (streamInfo?.game !== EGame.UNSET ? streamInfo?.game : selectedGame) ||
      selectedGame ||
      undefined,
  );
  const gameOptions = supportedGames;
  const gameConfig = getConfigByGame(game);

  function handleInputChange(value: string) {
    setInputValue(value);
  }

  function onSelect(game: EGame) {
    setGame(game as EGame);
  }

  const specialCharacterValidator = {
    pattern: /[\\/:"*?<>|]+/g,
    message: $t('You cannot use special characters in this field'),
  };

  async function importStreamFromDevice() {
    const selections = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
      properties: ['openFile'],
      filters: [{ name: $t('Video Files'), extensions: SUPPORTED_FILE_TYPES }],
    });

    if (selections && selections.filePaths) {
      return selections.filePaths;
    }
  }

  function closeModal(trackAsCanceled: boolean) {
    if (trackAsCanceled) {
      UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'DetectionModalCanceled',
        openedFrom,
        streamId: streamInfo?.id,
        game,
      });
    }
    close();
  }

  async function startImport(game: EGame, filePath: string[] | undefined, id?: string) {
    try {
      // Make sure a video is selected before we do anything else so that game + title
      // (and the file) are all known before an install is ever triggered.
      if (!filePath || filePath.length === 0) {
        filePath = await importStreamFromDevice();
      }
      if (!filePath || filePath.length === 0) {
        return;
      }

      // With neither app installed, hand the import to the installer instead of deeplinking it:
      // the video and game go into the install origin marker, and Replay picks them up on its
      // first launch. This keeps every entry point (Go-live and the Highlighter page) on the
      // same flow — game + title first, install second, then Replay opens directly on the import
      // screen with the game and video. pendingImport is only kept so a retry writes the same
      // marker and so onInstallComplete can close this modal.
      //
      // With either app installed the import is deeplinked, and the service picks the protocol —
      // a Highlighter user is sent to Highlighter, where their data still lives.
      const app = await HighlighterService.actions.return.getInstalledHighlighterApp();
      if (app === 'none') {
        setPendingImport({ game, filePath: filePath[0], streamId: id });
        setShowingInstallFlow(true);
        HighlighterService.actions.installStreamlabsReplay({ videoPath: filePath[0], game });
        return;
      }

      HighlighterService.actions.openReplayImport(filePath[0], game, openedFrom, id, inputValue);
      closeModal(false);
    } catch (error: unknown) {
      console.error('Error importing file via Replay deeplink', error);
    }
  }
  const [artwork, setArtwork] = useState<string | undefined>(
    gameConfig?.importModalConfig?.artwork,
  );
  const [isAnimating, setIsAnimating] = useState(false);
  useEffect(() => {
    if (gameConfig?.importModalConfig?.artwork !== artwork) {
      setIsAnimating(true);
      setTimeout(() => {
        setArtwork(gameConfig?.importModalConfig?.artwork);
        setIsAnimating(false);
      }, 200); // Match the duration of the CSS animation
    }
  }, [gameConfig?.importModalConfig?.artwork]);

  function renderInstallationFlow() {
    return (
      <ModalInstallationFlow
        installOriginMetadata={
          pendingImport
            ? { videoPath: pendingImport.filePath, game: pendingImport.game }
            : undefined
        }
        onCancel={() => {
          setShowingInstallFlow(false);
          closeModal(true);
        }}
        onInstallComplete={() => {
          setInstalledApp('replay');
          setShowingInstallFlow(false);

          // Deliberately no import deeplink here. The install origin marker already carried the
          // video and game, and Replay acts on it when the installer launches it, so sending the
          // link as well would open the same import a second time. Only the tracking the
          // deeplink would have recorded is kept.
          if (pendingImport) {
            UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
              type: 'ReplayImport',
              openedFrom,
              streamId: pendingImport.streamId,
              game: pendingImport.game,
              // Separates marker hand-offs from deeplinked imports in the ReplayImport numbers
              via: 'install-marker',
            });
            setPendingImport(null);
            closeModal(false);
          }
        }}
      />
    );
  }

  // Show the install UI only once the user has committed to importing (game + title
  // selected, then startImport triggers the install). Applies to every entry point so
  // the import form is always shown first, never the install flow.
  if (installedApp === 'none' && showingInstallFlow) {
    return (
      <HypeWrapper gameConfig={gameConfig} isAnimating={false} artwork={artwork}>
        {renderInstallationFlow()}
      </HypeWrapper>
    );
  }

  function selectRecording(recording: IRecordingEntry) {
    setFilePath(recording.filename);
    setShowingRecordingPicker(false);
    setOpenGameSelectOnShow(!game);
  }

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <h2 style={{ fontWeight: 600, margin: 0 }}>
        {openedFrom === 'after-stream' ? 'Ai Highlighter' : `${$t('Import Game Recording')}`}
      </h2>{' '}
      <div>
        <Button type="text" onClick={() => closeModal(true)}>
          <i className="icon-close" style={{ margin: 0 }}></i>
        </Button>
      </div>
    </div>
  );

  if (showingRecordingPicker) {
    return (
      <HypeWrapper gameConfig={gameConfig} isAnimating={isAnimating} artwork={artwork}>
        {header}
        <p style={{ margin: 0 }}>{$t('Select one of your recent recordings')}</p>
        <div className={styles.recordingGrid}>
          {recentRecordings.map(recording => (
            <button
              key={recording.timestamp}
              className={styles.recordingThumbnail}
              onClick={() => selectRecording(recording)}
            >
              {/* Seeking a bit in avoids a black first frame */}
              <video src={`${recording.filename}#t=1`} preload="metadata" muted />
              <span className={styles.recordingDate}>{getRelativeDay(recording.timestamp)}</span>
            </button>
          ))}
        </div>
        <Button size="large" onClick={() => setShowingRecordingPicker(false)}>
          {$t('Select another file')}
        </Button>
      </HypeWrapper>
    );
  }

  return (
    <HypeWrapper gameConfig={gameConfig} isAnimating={isAnimating} artwork={artwork}>
      {header}

      <TextInput
        className={styles.customInput}
        value={inputValue}
        name="name"
        placeholder={$t('Set a title for your recording')}
        onChange={handleInputChange}
        style={{ width: '100%', color: 'black', border: 'none' }}
        rules={[specialCharacterValidator]}
        nowrap
      />
      <div
        onClick={async () => {
          const path = await importStreamFromDevice();
          setFilePath(path ? path[0] : undefined);
        }}
        onDragOver={e => {
          e.preventDefault();
          setDraggingOver(true);
        }}
        onDrop={e => {
          const extensions = SUPPORTED_FILE_TYPES.map(e => `.${e}`);
          const files: string[] = [];
          let fi = e.dataTransfer.files.length;
          while (fi--) {
            const file = e.dataTransfer.files.item(fi)?.path;
            if (file) files.push(file);
          }
          const filtered = files.filter(f => extensions.includes(path.parse(f).ext));
          if (filtered.length) {
            setFilePath(filtered[0]);
            setDraggingOver(false);
          }

          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={() => setDraggingOver(false)}
        className={styles.videoPreview}
        style={
          {
            '--border-style': filePath ? 'solid' : 'dashed',
            '--border-color': draggingOver ? 'var(--teal)' : 'var(--midtone)',
            cursor: 'pointer',
          } as React.CSSProperties
        }
      >
        {filePath ? (
          <video src={filePath} controls></video>
        ) : (
          <div
            onDrop={(e: React.DragEvent<HTMLDivElement>) => {}}
            style={{ display: 'grid', placeItems: 'center' }}
          >
            <i
              className="fa fa-plus"
              style={{ color: draggingOver ? 'var(--teal)' : 'inherit' }}
            ></i>
            <h3
              className={styles.dragAndDrop}
              style={{
                color: draggingOver ? 'var(--teal)' : 'inherit',
              }}
            >
              {$t('Drag and drop game recording or click to select')}
            </h3>
          </div>
        )}
      </div>
      <Form layout="vertical">
        <p
          style={{
            marginBottom: '8px',
          }}
        >
          {$t('Select game played in recording')}
        </p>
        <ListInput
          onSelect={(val, opts) => {
            onSelect(opts.value);
          }}
          onChange={value => {
            setGame(value || null);
          }}
          placeholder={$t('Start typing to search')}
          options={gameOptions}
          defaultValue={game}
          open={gameSelectOpen}
          onDropdownVisibleChange={setGameSelectOpen}
          autoFocus={gameSelectOpen}
          showSearch
          optionRender={option => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {option.image && (
                <img
                  src={typeof option.image === 'string' ? option.image : undefined}
                  alt={option.label}
                  className={styles.listImage}
                />
              )}
              <span>{option.label}</span>
              <span style={{ fontSize: '12px', opacity: '0.5' }}>{option.description}</span>
            </div>
          )}
          debounce={500}
          allowClear
        />
      </Form>

      <div style={{ display: 'flex', gap: '8px' }}>
        {openedFrom === 'after-stream' && (
          <Button
            size="large"
            style={{ width: '100%', marginTop: '4px' }}
            type="default"
            onClick={() => closeModal(true)}
          >
            {$t('Cancel')}
          </Button>
        )}

        <Button
          disabled={!game}
          size="large"
          style={{
            width: '100%',
            marginTop: '4px',
            backgroundColor: gameConfig?.importModalConfig?.accentColor,
            borderColor: gameConfig?.importModalConfig?.accentColor,
          }}
          type="primary"
          onClick={() => startImport(game!, filePath ? [filePath] : undefined, streamInfo?.id)}
        >
          {filePath ? $t('Find game highlights') : $t('Select video and start import')}
        </Button>
      </div>
      <div className={styles.explainerTextWrapper}>
        <p className={styles.explainerText}>
          {' '}
          {installedApp === 'replay' &&
            $t('Continuing will open %{appName}', { appName: REPLAY_APP_NAME })}
          {installedApp === 'highlighter' &&
            $t('Continuing will open %{appName}', { appName: HIGHLIGHTER_APP_NAME })}
          {installedApp !== 'replay' &&
            installedApp !== 'highlighter' &&
            $t('Continuing will install %{appName}', { appName: REPLAY_APP_NAME })}
        </p>
      </div>
    </HypeWrapper>
  );
}

/** "Today", "Yesterday" or "X days ago", counted in calendar days */
function getRelativeDay(timestamp: string) {
  const days = moment().startOf('day').diff(moment(timestamp).startOf('day'), 'days');
  if (days <= 0) return $t('Today');
  if (days === 1) return $t('Yesterday');
  return $t('%{count} days ago', { count: days });
}
