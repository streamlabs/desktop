import { Button, Form, Select } from 'antd';
import { Services } from 'components-react/service-provider';
import { ListInput, TextInput } from 'components-react/shared/inputs';

import * as remote from '@electron/remote';
import { SUPPORTED_FILE_TYPES } from 'services/highlighter/constants';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { IStreamInfoForAiHighlighter } from 'services/highlighter/models/highlighter.models';
import { $t } from 'services/i18n';
import uuid from 'uuid';
import React, { useRef, useState } from 'react';
import styles from './StreamView.m.less';
import { supportedGames } from 'services/highlighter/models/game-config.models';
import path from 'path';

export function ImportStreamModal({
  close,
  videoPath,
  selectedGame,
}: {
  close: () => void;
  videoPath?: string;
  selectedGame?: EGame;
}) {
  const { HighlighterService } = Services;
  const [inputValue, setInputValue] = useState<string>('');
  const [filePath, setFilePath] = useState<string | undefined>(videoPath);
  const [draggingOver, setDraggingOver] = useState<boolean>(false);
  const [game, setGame] = useState<EGame | null>(selectedGame || null);
  const gameOptions = supportedGames;

  function handleInputChange(value: string) {
    setInputValue(value);
  }

  function onSelect(game: EGame) {
    setGame(game as EGame);
  }

  function specialCharacterValidator(rule: unknown, value: string, callback: Function) {
    if (/[\\/:"*?<>|]+/g.test(value)) {
      callback($t('You cannot use special characters in this field'));
    } else {
      callback();
    }
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

  async function startAiDetection(title: string, game: EGame, filePath: string[] | undefined) {
    if (/[\\/:"*?<>|]+/g.test(title)) return;
    const streamInfo: IStreamInfoForAiHighlighter = {
      id: 'manual_' + uuid(),
      title,
      game,
    };

    try {
      if (game && filePath && filePath.length > 0) {
        HighlighterService.actions.detectAndClipAiHighlights(filePath[0], streamInfo);
        close();
        return;
      }

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
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ fontWeight: 600, margin: 0 }}>{$t('Import Game Recording')}</h2>{' '}
          <div>
            <Button type="text" onClick={close}>
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
          rules={[{ validator: specialCharacterValidator }]}
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
            console.log(e.dataTransfer.files);

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
                style={{
                  fontWeight: 400,
                  marginTop: '12px',
                  color: draggingOver ? 'var(--teal)' : 'inherit',
                  textAlign: 'center',
                }}
              >
                Drag and drop game recording <br />
                or click to select
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
            Select game played in recording
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
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
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
        <Button
          disabled={!game}
          size="large"
          style={{ width: '100%', marginTop: '4px' }}
          type="primary"
          onClick={() => startAiDetection(inputValue, game!, filePath ? [filePath] : undefined)}
        >
          {filePath ? $t('Import video') : $t('Select video and start import')}
        </Button>
      </div>
    </>
  );
}
