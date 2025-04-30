import { Button, Form, Select } from 'antd';
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
import uuid from 'uuid';
import React, { useEffect, useRef, useState } from 'react';
import styles from './StreamView.m.less';
import { getConfigByGame, supportedGames } from 'services/highlighter/models/game-config.models';
import path from 'path';

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
      });
    }
    close();
  }
  async function startAiDetection(
    title: string,
    game: EGame,
    filePath: string[] | undefined,
    id?: string,
  ) {
    if (/[\\/:"*?<>|]+/g.test(title)) return;
    const streamInfo: IStreamInfoForAiHighlighter = {
      id: id ?? 'manual_' + uuid(),
      title,
      game,
    };

    try {
      if (game && filePath && filePath.length > 0) {
        HighlighterService.actions.detectAndClipAiHighlights(filePath[0], streamInfo);
        UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'DetectionInModalStarted',
          openedFrom,
          streamId: id,
        });
        closeModal(false);
        return;
      }

      filePath = await importStreamFromDevice();
      if (filePath && filePath.length > 0) {
        HighlighterService.actions.detectAndClipAiHighlights(filePath[0], streamInfo);
        UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'DetectionInModalStarted',
          openedFrom,
          streamId: id,
        });
        closeModal(false);
      } else {
        // No file selected
      }
    } catch (error: unknown) {
      console.error('Error importing file from device', error);
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
  return (
    <>
      <div
        className={styles.hypeWrapper}
        style={{
          backgroundColor: gameConfig?.importModalConfig?.backgroundColor || 'var(--section)',
          clipPath: gameConfig
            ? 'inset(0px 0px 0px 0px round 13px)'
            : 'inset(158px 471px 158px 471px round 13px)',
        }}
      >
        <div className={styles.hypeContent}>
          <img
            className={`${styles.artworkImage} ${isAnimating ? styles.fadeOut : styles.fadeIn}`}
            src={artwork}
            alt=""
          />
          <div className={styles.overlay}>overlay</div>
          <div
            className={styles.coloredBlob}
            style={{
              backgroundColor: `${gameConfig?.importModalConfig?.accentColor}`,
            }}
          ></div>
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              display: 'grid',

              gridTemplateColumns: '1fr 400px 1fr',
              top: '0',
              left: '0',
            }}
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                paddingLeft: '12%',
                alignSelf: 'center',
              }}
            >
              <h2 className={styles.hypeContentHeadline}>
                Turn your gameplays into epic highlight reels
              </h2>
              <h2 className={styles.hypeContentSubheadline}>Dominate, showcase, inspire!</h2>
            </div>
            <div></div>
            <div></div>
          </div>
        </div>
        <div
          className={styles.manualUploadWrapper}
          style={{ borderColor: `${gameConfig?.importModalConfig?.accentColor}40` }}
        >
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
                      style={{
                        width: '24px',
                        height: '24px',
                        objectFit: 'cover',
                        borderRadius: '2px',
                      }}
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
                borderColor: gameConfig?.importModalConfig?.backgroundColor,
              }}
              type="primary"
              onClick={() =>
                startAiDetection(
                  inputValue,
                  game!,
                  filePath ? [filePath] : undefined,
                  streamInfo?.id,
                )
              }
            >
              {filePath ? $t('Find game highlights') : $t('Select video and start import')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
