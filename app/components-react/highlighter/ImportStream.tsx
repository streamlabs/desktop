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
        game,
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
    const streamInfo: IStreamInfoForAiHighlighter = {
      id: id ?? 'manual_' + uuid(),
      title: title.replace(/[\\/:"*?<>|]+/g, ''),
      game,
    };

    try {
      if (game && filePath && filePath.length > 0) {
        HighlighterService.actions.detectAndClipAiHighlights(filePath[0], streamInfo);
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
        HighlighterService.actions.detectAndClipAiHighlights(filePath[0], streamInfo);
        UsageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'DetectionInModalStarted',
          openedFrom,
          streamId: id,
          game,
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
        className={cx(
          styles.hypeWrapper,
          gameConfig?.importModalConfig && styles.hypeWrapperWithImportConfig,
        )}
        style={{
          backgroundColor: gameConfig?.importModalConfig?.backgroundColor || 'var(--section)',
        }}
      >
        <div className={styles.hypeContent}>
          <img
            className={`${styles.artworkImage} ${isAnimating ? styles.fadeOut : styles.fadeIn}`}
            src={artwork}
            alt=""
          />
          <div className={styles.overlay}></div>
          <div
            className={styles.coloredBlob}
            style={{
              backgroundColor: `${gameConfig?.importModalConfig?.accentColor}`,
            }}
          ></div>
          <div className={styles.contentDivider}>
            <div className={styles.leftWrapper}>
              <div className={styles.headerWrapper}>
                <h2 className={styles.hypeContentHeadline}>
                  {$t('Turn your gameplay into epic highlight reels')}
                </h2>
                <h2 className={styles.hypeContentSubheadline}>
                  {$t('Dominate, showcase, inspire!')}
                </h2>
              </div>
              {gameConfig?.importModalConfig?.horizontalExampleVideo &&
                gameConfig?.importModalConfig?.verticalExampleVideo && (
                  <div style={{ position: 'relative' }}>
                    <div className={styles.plattformIcon} style={{ top: '42px', left: '160px' }}>
                      <YouTubeLogo />
                    </div>
                    <div className={styles.plattformIcon} style={{ top: '182px', left: '32px' }}>
                      <DiscordLogo />
                    </div>

                    <div className={styles.plattformIcon} style={{ top: '243px', left: '290px' }}>
                      <TikTokLogo />
                    </div>

                    <div className={styles.plattformIcon} style={{ top: '283px', left: '153px' }}>
                      <InstagramLogo />
                    </div>
                    <div
                      className={styles.horizontalVideo}
                      style={{
                        backgroundColor: gameConfig?.importModalConfig?.backgroundColor,
                        borderColor: gameConfig?.importModalConfig?.accentColor,
                        boxShadow: `0px 0px 42px -4px ${gameConfig?.importModalConfig?.accentColor}30`,
                      }}
                    >
                      <video
                        muted
                        autoPlay
                        loop
                        style={{ width: '100%' }}
                        src={gameConfig.importModalConfig.horizontalExampleVideo}
                      ></video>
                    </div>
                    <div
                      className={styles.verticalVideo}
                      style={{
                        backgroundColor: gameConfig?.importModalConfig?.backgroundColor,
                        borderColor: gameConfig?.importModalConfig?.accentColor,
                        boxShadow: `0px 0px 42px -4px ${gameConfig?.importModalConfig?.accentColor}30`,
                      }}
                    >
                      {' '}
                      <video
                        muted
                        autoPlay
                        loop
                        style={{ height: '100%' }}
                        src={gameConfig.importModalConfig.verticalExampleVideo}
                      ></video>
                    </div>
                  </div>
                )}
            </div>
            <div></div>
            <div></div>
          </div>
        </div>
        <div
          className={styles.manualUploadWrapper}
          style={{
            borderColor:
              gameConfig?.importModalConfig?.accentColor &&
              `${gameConfig?.importModalConfig?.accentColor}40`,
          }}
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

export function YouTubeLogo() {
  return (
    <svg width="35" height="28" viewBox="0 0 35 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="9.1709"
        y="7.53497"
        width="14.7901"
        height="11.3769"
        transform="rotate(-1.90445 9.1709 7.53497)"
        fill="white"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.35408 26.1424C15.208 25.1663 22.9461 23.7506 30.637 21.883C32.1247 21.5045 33.2901 19.9448 33.1854 18.4049C32.7769 13.2709 31.8611 8.26517 30.4255 3.31908C29.9783 1.84181 28.3361 0.795762 26.8108 0.968515C18.9569 1.9447 11.2187 3.36034 3.52791 5.22796C2.04019 5.60643 0.874717 7.16612 0.979506 8.70603C1.38796 13.84 2.30373 18.8458 3.73937 23.7919C4.18655 25.2692 5.82873 26.3152 7.35408 26.1424ZM22.0544 12.2913L13.1618 9.52437L14.7174 18.0273L22.0544 12.2913Z"
        fill="#EA3223"
      />
    </svg>
  );
}

export function DiscordLogo() {
  return (
    <svg width="29" height="29" viewBox="0 0 29 29" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="3.13184"
        y="0.962158"
        width="25"
        height="25"
        rx="8"
        transform="rotate(4.97985 3.13184 0.962158)"
        fill="#5865F2"
      />
      <path
        d="M17.4477 8.23233C17.2564 8.51433 17.0811 8.80804 16.9187 9.10973C15.6521 8.80369 14.345 8.6898 13.0413 8.77188C12.9369 8.44694 12.8116 8.12704 12.6719 7.81619C11.4481 7.91898 10.2409 8.18113 9.08152 8.5985C6.58494 11.7077 5.70686 14.872 5.72768 18.07C6.93724 19.147 8.32207 20.0092 9.82461 20.6139C10.2135 20.174 10.5645 19.6999 10.8733 19.2016C10.3898 18.9706 9.92729 18.6935 9.48833 18.3806C9.61763 18.3026 9.74386 18.2209 9.86641 18.1423C12.4663 19.6665 15.6074 19.9402 18.4351 18.8889C18.5417 18.9943 18.6519 19.0966 18.7663 19.189C18.2796 19.4247 17.7764 19.6143 17.2565 19.7612C17.4745 20.3055 17.7382 20.8331 18.0452 21.3336C19.6296 20.9979 21.1424 20.3916 22.5201 19.5401C23.1919 15.8909 22.5174 12.6187 20.8484 9.62724C19.7821 9.01593 18.6385 8.54893 17.4505 8.23943L17.4477 8.23233ZM11.4808 16.6042C10.6466 16.5315 10.0207 15.7079 10.1029 14.7641C10.1852 13.8203 10.9173 13.1117 11.7752 13.1864C12.6331 13.2612 13.2482 14.0906 13.1528 15.0299C13.0574 15.9691 12.3319 16.6783 11.4808 16.6042ZM17.1077 17.0945C16.2701 17.0215 15.651 16.1985 15.7332 15.2547C15.8155 14.3109 16.5476 13.6022 17.4055 13.677C18.2634 13.7518 18.8752 14.5809 18.7797 15.5202C18.6843 16.4594 17.9589 17.1686 17.1077 17.0945Z"
        fill="white"
      />
    </svg>
  );
}

export function TikTokLogo() {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21.9984 13.1546C23.8194 14.7232 26.1308 15.7589 28.7076 15.9933L29.1584 11.0373C28.6707 10.993 28.1889 10.8979 27.721 10.7535L27.3662 14.6546C24.7895 14.4203 22.4785 13.3846 20.657 11.816L19.737 21.9299C19.2768 26.9893 14.8002 30.7173 9.73848 30.2569C7.84982 30.0851 6.1463 29.3547 4.77709 28.2434C6.28672 30.0956 8.51179 31.3619 11.0796 31.5954C16.1417 32.0558 20.6185 28.3279 21.0787 23.2683L21.9986 13.1546L21.9984 13.1546ZM24.2434 8.3174C23.3469 7.14006 22.8212 5.67611 22.821 4.11051L22.879 3.47306L21.5038 3.34797C21.6704 5.35299 22.6978 7.14645 24.2434 8.3174ZM8.33178 24.6521C7.84197 23.8728 7.62255 22.9539 7.70727 22.0374C7.91774 19.7234 9.96536 18.0179 12.281 18.2285C12.7126 18.2677 13.1356 18.3728 13.535 18.5406L13.9958 13.4738C13.5212 13.3642 13.0386 13.2922 12.5528 13.2583L12.1941 17.2021C11.7944 17.0342 11.3713 16.9289 10.9396 16.8901C8.6239 16.6794 6.57641 18.3848 6.36591 20.6991C6.21707 22.3354 7.02638 23.8375 8.33178 24.6521Z"
        fill="#FF004F"
      />
      <path
        d="M20.654 11.8154C22.4755 13.3839 24.7866 14.4196 27.3632 14.654L27.718 10.7529C26.3076 10.3158 25.1027 9.44881 24.2404 8.31684C22.6947 7.14578 21.6675 5.35233 21.5008 3.34741L17.8885 3.01885L16.088 22.8138C15.8699 25.1208 13.8262 26.8189 11.5155 26.6087C10.1539 26.4849 9.00318 25.7261 8.32847 24.6515C7.02317 23.8369 6.21387 22.3348 6.36269 20.6986C6.57317 18.3845 8.62068 16.679 10.9363 16.8896C11.38 16.9299 11.8014 17.0379 12.1909 17.2016L12.5496 13.2578C7.56747 12.9082 3.19872 16.6056 2.74443 21.6002C2.51764 24.0935 3.30799 26.4444 4.77418 28.2429C6.1434 29.3542 7.84691 30.0846 9.73557 30.2564C14.7974 30.7168 19.274 26.9887 19.7341 21.9293L20.654 11.8154Z"
        fill="black"
      />
      <path
        d="M27.7176 10.7513L27.8135 9.69652C26.5164 9.58052 25.2779 9.10184 24.24 8.31524C25.1171 9.46974 26.3329 10.3214 27.7176 10.7513ZM21.5004 3.34591C21.4845 3.1543 21.4764 2.96215 21.4761 2.76997L21.5341 2.13252L16.5465 1.67887L14.746 21.474C14.5281 23.7807 12.4845 25.4788 10.1736 25.2686C9.49519 25.2069 8.86927 24.9877 8.32802 24.6501C9.00274 25.7246 10.1534 26.4833 11.5151 26.6071C13.8256 26.8173 15.8696 25.1194 16.0876 22.8124L17.888 3.01735L21.5004 3.34591ZM12.5494 13.2564L12.6515 12.1334C12.24 12.0386 11.8224 11.9718 11.4017 11.9337C6.33941 11.4733 1.86277 15.2013 1.40262 20.2604C1.11413 23.4321 2.47267 26.3741 4.77386 28.2412C3.30766 26.4428 2.51732 24.0918 2.7441 21.5987C3.19838 16.6041 7.56702 12.9067 12.5494 13.2564Z"
        fill="#00F2EA"
      />
    </svg>
  );
}

export function InstagramLogo() {
  return (
    <svg width="31" height="31" viewBox="0 0 31 31" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.5204 2.79013C7.29493 3.95534 5.7679 4.30151 5.47633 4.3924C4.42386 4.72066 3.79423 5.03829 3.14798 5.56234C2.64977 5.96546 2.27984 6.38646 1.94458 6.93573C1.33425 7.9372 1.07911 9.05873 1.1737 10.3031C1.2195 10.9073 1.22148 11.0322 1.88309 14.0228C2.10337 15.0197 2.39774 16.3307 2.78999 18.0898C3.95426 23.311 4.30048 24.8364 4.39162 25.1273C4.71093 26.1514 5.02097 26.7714 5.52764 27.4122C6.49644 28.6392 7.99141 29.389 9.56739 29.4418C10.113 29.4596 10.6992 29.4057 11.4385 29.2772C11.7514 29.2215 14.9129 28.5267 18.0741 27.8218C21.2353 27.1169 24.3956 26.4081 24.6945 26.3253C25.5327 26.0965 26.0098 25.9208 26.5224 25.659C27.9358 24.9376 28.9509 23.6442 29.3159 22.0996C29.4994 21.3231 29.5197 20.6032 29.3772 19.5968C29.346 19.3774 28.5865 15.9379 27.821 12.5047C27.0553 9.07089 26.2824 5.6411 26.2174 5.42925C25.9143 4.44189 25.5913 3.80457 25.0813 3.16853C24.6631 2.64802 24.2461 2.28265 23.6826 1.93965C22.6782 1.33342 21.5582 1.07793 20.3127 1.17298C19.7091 1.21884 19.5871 1.21978 16.5941 1.88172L12.5204 2.79013Z"
        fill="url(#paint0_radial_3326_22115)"
      />
      <path
        d="M12.5204 2.79074C7.29493 3.95595 5.7679 4.30212 5.47633 4.39301C4.42386 4.72127 3.79423 5.0389 3.14798 5.56295C2.64977 5.96607 2.27984 6.38707 1.94458 6.93634C1.33425 7.93781 1.07911 9.05934 1.1737 10.3038C1.2195 10.9079 1.22148 11.0328 1.88309 14.0234C2.10337 15.0203 2.39774 16.3313 2.78999 18.0904C3.95426 23.3116 4.30048 24.837 4.39162 25.1279C4.71093 26.152 5.02097 26.772 5.52764 27.4129C6.49644 28.6398 7.99141 29.3896 9.56739 29.4424C10.113 29.4602 10.6992 29.4063 11.4385 29.2778C11.7514 29.2222 14.9129 28.5273 18.0741 27.8224C21.2353 27.1175 24.3956 26.4087 24.6945 26.3259C25.5327 26.0972 26.0098 25.9214 26.5224 25.6596C27.9358 24.9382 28.9509 23.6448 29.3159 22.1003C29.4994 21.3237 29.5197 20.6038 29.3772 19.5974C29.346 19.378 28.5865 15.9385 27.821 12.5053C27.0553 9.0715 26.2824 5.64171 26.2174 5.42986C25.9143 4.4425 25.5913 3.80518 25.0813 3.16914C24.6631 2.64863 24.2461 2.28326 23.6826 1.94026C22.6782 1.33403 21.5582 1.07854 20.3127 1.17359C19.7091 1.21945 19.5871 1.22039 16.5941 1.88233L12.5204 2.79074Z"
        fill="url(#paint1_radial_3326_22115)"
      />
      <path
        d="M13.2428 6.06234C10.7331 6.62198 10.4206 6.70319 9.44486 6.96785C8.47111 7.23227 7.83433 7.53777 7.29771 7.89731C6.74255 8.26887 6.29738 8.69958 5.89831 9.32795C5.49882 9.95623 5.29805 10.5422 5.19674 11.2026C5.0987 11.8415 5.09254 12.5479 5.26755 13.5412C5.44327 14.5368 5.50199 14.8545 6.06163 17.3642C6.62127 19.8739 6.70246 20.1854 6.96692 21.1612C7.23154 22.1349 7.53703 22.7717 7.89639 23.3083C8.26814 23.8634 8.69884 24.3086 9.32722 24.7077C9.9553 25.1072 10.5415 25.3087 11.2015 25.4093C11.8404 25.5067 12.5469 25.5127 13.5405 25.3384C14.5362 25.1635 14.8534 25.1043 17.363 24.5447C19.8729 23.985 20.1844 23.904 21.1601 23.6393C22.1339 23.3749 22.7714 23.0692 23.3084 22.7096C23.8634 22.3381 24.3076 21.9068 24.7065 21.2783C25.1059 20.65 25.3067 20.064 25.408 19.4036C25.5041 18.7652 25.5103 18.0587 25.3372 17.065C25.1617 16.0694 25.1032 15.7526 24.5435 13.2429C23.9839 10.7332 23.9021 10.4208 23.638 9.445C23.3725 8.47152 23.0668 7.83478 22.7086 7.29786C22.3362 6.74287 21.9055 6.29771 21.277 5.89868C20.6483 5.49927 20.0639 5.29816 19.4029 5.19798C18.7628 5.10083 18.0562 5.09491 17.0624 5.26923C16.0667 5.44417 15.7504 5.50318 13.2399 6.06299L13.2428 6.06234ZM12.7851 7.91251C13.0311 7.85726 13.3057 7.79643 13.6141 7.72765C16.0815 7.17746 16.3759 7.12111 17.3602 6.94812C18.2703 6.7884 18.7929 6.82991 19.1469 6.88376C19.6155 6.95509 19.9676 7.08675 20.3629 7.33811C20.7585 7.58942 21.0274 7.85281 21.2915 8.24662C21.4905 8.54378 21.7503 8.99917 21.9922 9.89102C22.2537 10.8553 22.3286 11.1458 22.8785 13.612C23.4285 16.0782 23.4841 16.373 23.657 17.357C23.8168 18.2672 23.7752 18.7898 23.7213 19.1433C23.65 19.6119 23.5178 19.9637 23.2665 20.3591C23.0152 20.7547 22.7527 21.0234 22.3587 21.2871C22.0616 21.4867 21.6057 21.746 20.7139 21.9881C19.7496 22.2496 19.4591 22.3245 16.9918 22.8747C14.5242 23.4249 14.2296 23.4805 13.2456 23.6534C12.3353 23.8128 11.8127 23.7713 11.4586 23.7175C10.99 23.6461 10.6373 23.5146 10.2418 23.2633C9.8462 23.012 9.57746 22.7493 9.31337 22.3553C9.11433 22.0582 8.85455 21.6028 8.61263 20.7109C8.35112 19.7467 8.27701 19.456 7.72673 16.9883C7.17645 14.5205 7.12039 14.2274 6.94745 13.2434C6.78773 12.3332 6.82924 11.8106 6.88309 11.4567C6.95442 10.9881 7.08634 10.6353 7.33765 10.2398C7.58897 9.84421 7.85235 9.5753 8.24617 9.31126C8.54358 9.11156 8.99929 8.85231 9.89107 8.61C10.735 8.3814 11.0628 8.29618 12.7846 7.9102L12.7851 7.91251ZM18.8891 8.16209C18.2769 8.29861 17.8908 8.9055 18.0274 9.51791C18.1639 10.1301 18.7713 10.5161 19.3836 10.3796C19.9958 10.243 20.3817 9.63557 20.2452 9.02335C20.1087 8.41113 19.5012 8.02519 18.889 8.16171L18.8891 8.16209ZM14.2452 10.5577C11.6244 11.1421 9.97338 13.7408 10.5578 16.3616C11.1422 18.9824 13.7407 20.6325 16.3615 20.0481C18.9823 19.4637 20.6328 16.8661 20.0483 14.2453C19.4639 11.6245 16.866 9.97331 14.2452 10.5577ZM14.6166 12.223C16.3177 11.8437 18.0044 12.9152 18.3838 14.6165C18.7631 16.3176 17.6915 18.0044 15.9903 18.3837C14.289 18.7631 12.6024 17.6914 12.2231 15.9903C11.8437 14.2889 12.9153 12.6024 14.6166 12.223Z"
        fill="white"
      />
      <defs>
        <radialGradient
          id="paint0_radial_3326_22115"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(12.6596 31.0525) rotate(-102.571) scale(25.4115 23.6411)"
        >
          <stop stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="1" stopColor="#C837AB" />
        </radialGradient>
        <radialGradient
          id="paint1_radial_3326_22115"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(-3.79108 8.32046) rotate(66.1069) scale(11.3591 46.8348)"
        >
          <stop stopColor="#3771C8" />
          <stop offset="0.128" stopColor="#3771C8" />
          <stop offset="1" stopColor="#6600FF" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
