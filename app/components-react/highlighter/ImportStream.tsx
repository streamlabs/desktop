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
import React, { useRef, useState } from 'react';
import styles from './StreamView.m.less';
import { supportedGames } from 'services/highlighter/models/game-config.models';
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
  const [game, setGame] = useState<EGame | null>(
    (streamInfo?.game !== EGame.UNSET ? streamInfo?.game : selectedGame) || selectedGame || null,
  );
  const gameOptions = supportedGames;

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
  return (
    <>
      <div className={styles.manualUploadWrapper}>
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
            style={{ width: '100%', marginTop: '4px' }}
            type="primary"
            onClick={() =>
              startAiDetection(inputValue, game!, filePath ? [filePath] : undefined, streamInfo?.id)
            }
          >
            {filePath ? $t('Find game highlights') : $t('Select video and start import')}
          </Button>
        </div>
      </div>
    </>
  );
}
