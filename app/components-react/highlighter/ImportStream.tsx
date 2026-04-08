import { Button, Form, Select } from 'antd';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { ListInput, TextInput } from 'components-react/shared/inputs';
import * as remote from '@electron/remote';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import {
  IStreamInfoForAiHighlighter,
  TOpenedFrom,
} from 'services/highlighter/models/highlighter.models';
import { $t } from 'services/i18n';
import React, { useEffect, useRef, useState } from 'react';
import styles from './StreamView.m.less';
import { getConfigByGame, supportedGames } from 'services/highlighter/models/game-config.models';
import path from 'path';
import MigrationNotice from './MigrationNotice';
import { HypeWrapper } from './HypeWrapper';

type GameConfig = ReturnType<typeof getConfigByGame>;

export function ImportStreamModal({
  close,
  openedFrom,
  videoPath,
  selectedGame,
  streamInfo,
}: {
  close: () => void;
  openedFrom: TOpenedFrom;
  videoPath?: string;
  selectedGame?: EGame;
  streamInfo?: IStreamInfoForAiHighlighter;
}) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const [replayInstalled, setReplayInstalled] = useState<boolean | null>(null);
  const [showingInstallFlow, setShowingInstallFlow] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    game: EGame;
    filePath: string;
    streamId?: string;
  } | null>(null);

  useEffect(() => {
    HighlighterService.isStreamlabsReplayInstalled().then(installed => {
      setReplayInstalled(installed);
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
  function openReplayImport(videoPath: string, game: EGame) {
    const deeplink = `ghub-replay://import?path=${encodeURIComponent(
      videoPath,
    )}&game=${encodeURIComponent(game)}`;
    remote.shell.openExternal(deeplink);
  }

  async function startImport(game: EGame, filePath: string[] | undefined, id?: string) {
    try {
      // Check if Replay is installed, auto-install for after-stream flow
      const isInstalled = await HighlighterService.isStreamlabsReplayInstalled();
      if (!isInstalled && openedFrom === 'after-stream') {
        // Store import details and start installation
        if (filePath && filePath.length > 0) {
          setPendingImport({ game, filePath: filePath[0], streamId: id });
          setShowingInstallFlow(true);
          HighlighterService.installStreamlabsReplay();
        }
        return;
      }

      if (game && filePath && filePath.length > 0) {
        openReplayImport(filePath[0], game);
        UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'DetectionInModalStarted',
          openedFrom,
          streamId: id,
          game,
        });
        closeModal(false);
        return;
      }

      filePath = await importStreamFromDevice();
      if (filePath && filePath.length > 0) {
        openReplayImport(filePath[0], game);
        UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'DetectionInModalStarted',
          openedFrom,
          streamId: id,
          game,
        });
        closeModal(false);
      }
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

  function renderMigrationNotice() {
    return (
      <MigrationNotice
        variant="modal"
        onCancel={() => {
          setShowingInstallFlow(false);
          closeModal(true);
        }}
        onInstallComplete={() => {
          setReplayInstalled(true);
          setShowingInstallFlow(false);

          // If there's a pending import, execute it now
          if (pendingImport) {
            openReplayImport(pendingImport.filePath, pendingImport.game);
            UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
              type: 'DetectionInModalStarted',
              openedFrom,
              streamId: pendingImport.streamId,
              game: pendingImport.game,
            });
            setPendingImport(null);
            closeModal(false);
          }
        }}
      />
    );
  }

  // Show MigrationNotice if Replay is not installed
  // For non-after-stream flows (Highlighter component), show install UI immediately
  // For after-stream flow, only show when user triggers installation
  if (replayInstalled === false && (openedFrom !== 'after-stream' || showingInstallFlow)) {
    // For after-stream flow, wrap in hypeWrapper
    if (openedFrom === 'after-stream') {
      return (
        <HypeWrapper gameConfig={gameConfig} isAnimating={isAnimating} artwork={artwork}>
          {renderMigrationNotice()}
        </HypeWrapper>
      );
    }

    // For other flows, use simple wrapper
    return (
      <div
        style={{
          backgroundColor: 'var(--background)',
          borderRadius: '24px',
        }}
      >
        {renderMigrationNotice()}
      </div>
    );
  }

  return (
    <HypeWrapper gameConfig={gameConfig} isAnimating={isAnimating} artwork={artwork}>
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
      <Form>
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
    </HypeWrapper>
  );
}
