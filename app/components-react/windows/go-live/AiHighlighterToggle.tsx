import { SwitchInput } from 'components-react/shared/inputs/SwitchInput';
import React, { useEffect, useRef, useState } from 'react';
import styles from './AiHighlighterToggle.m.less';

import { Services } from 'components-react/service-provider';
import Highlighter from 'components-react/pages/Highlighter';
import { useVuex } from 'components-react/hooks';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Carousel } from 'antd';
import EducationCarousel from 'components-react/highlighter/EducationCarousel';
import { getConfigByGame, isGameSupported } from 'services/highlighter/models/game-config.models';
import { $t } from 'services/i18n';
import { set } from 'lodash';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import {
  DiscordLogo,
  InstagramLogo,
  TikTokLogo,
  YouTubeLogo,
} from 'components-react/highlighter/ImportStream';
import { promptAction } from 'components-react/modals';

export default function AiHighlighterToggle({
  game,
  cardIsExpanded,
}: {
  game: string | undefined;
  cardIsExpanded: boolean;
}) {
  //TODO M: Probably good way to integrate the highlighter in to GoLiveSettings
  const { HighlighterService, StreamingService } = Services;
  const { useHighlighter, highlighterVersion, isRecording, outputDisplay } = useVuex(() => {
    return {
      useHighlighter: HighlighterService.views.useAiHighlighter,
      highlighterVersion: HighlighterService.views.highlighterVersion,
      isRecording: StreamingService.views.isRecording,
      outputDisplay: StreamingService.views.outputDisplay,
    };
  });

  const [gameIsSupported, setGameIsSupported] = useState(false);
  const [gameConfig, setGameConfig] = useState<any>(null);
  const disableAIHighlighter = isRecording && outputDisplay === 'vertical';

  useEffect(() => {
    const supportedGame = isGameSupported(game);
    setGameIsSupported(!!supportedGame);
    if (supportedGame) {
      setIsExpanded(true);
      setGameConfig(getConfigByGame(supportedGame));
    } else {
      setGameConfig(null);
    }
  }, [game]);

  function getInitialExpandedState() {
    if (gameIsSupported) {
      return true;
    } else {
      if (useHighlighter) {
        return true;
      } else {
        return cardIsExpanded;
      }
    }
  }
  const initialExpandedState = getInitialExpandedState();
  const [isExpanded, setIsExpanded] = useState(initialExpandedState);

  function handleToggleHighlighter() {
    if (disableAIHighlighter) {
      promptAction({
        title: $t('Vertical Recording Active'),
        message: $t(
          'Vertical recording is in-progress. Would you like to stop the recording to enable AI Highlighter?',
        ),
        btnText: $t('Stop Recording'),
        fn: () => {
          StreamingService.actions.toggleRecording();
          HighlighterService.actions.toggleAiHighlighter();
        },
        cancelBtnPosition: 'left',
        cancelBtnText: $t('Cancel'),
      });

      return;
    }

    HighlighterService.actions.toggleAiHighlighter();
  }

  return (
    <div>
      {gameIsSupported ? (
        <div
          key={'aiSelector'}
          style={{
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'flex-end',
            flexFlow: 'rowWrap',
            width: 'width: 100%',
            backgroundColor: 'var(--dark-background)',
            borderRadius: '8px',
          }}
        >
          <div style={{ flexGrow: 0, backgroundColor: 'red' }}></div>

          <div className={styles.aiHighlighterBox}>
            <div
              className={styles.coloredBlob}
              style={{
                backgroundColor: `${gameConfig?.importModalConfig?.accentColor}`,
                opacity: isExpanded ? 0.5 : 1,
                filter: isExpanded ? 'blur(74px)' : 'blur(44px)',
              }}
            ></div>
            <div className={styles.header}>
              <div className={styles.headlineWrapper}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h3 className={styles.headline} onClick={() => setIsExpanded(!isExpanded)}>
                    {$t('Get stream highlights!')}
                  </h3>

                  {highlighterVersion !== '' ? (
                    <SwitchInput
                      style={{ width: '80px', margin: 0, marginTop: '-2px' }}
                      value={disableAIHighlighter ? false : useHighlighter}
                      label=""
                      onChange={handleToggleHighlighter}
                    />
                  ) : (
                    <Button
                      style={{ width: 'fit-content', marginLeft: '18px' }}
                      size="small"
                      type="primary"
                      onClick={() => {
                        HighlighterService.installAiHighlighter(false, 'Go-live-flow', game);
                      }}
                    >
                      {$t('Install AI Highlighter')}
                    </Button>
                  )}
                </div>
                <div onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer' }}>
                  {isExpanded ? (
                    <UpOutlined style={{ color: '#BDC2C4' }} />
                  ) : (
                    <DownOutlined style={{ color: '#BDC2C4' }} />
                  )}
                </div>
              </div>
              <div className={styles.headlineWrapper}>
                <h2 style={{ fontSize: '14px', fontWeight: 300 }}>
                  {$t('Auto-generate game highlight reels of your stream')}
                </h2>
                <div
                  className={styles.betaTag}
                  style={{ backgroundColor: `${gameConfig?.importModalConfig?.accentColor}` }}
                >
                  {$t('Beta')}
                </div>
              </div>
            </div>
            {isExpanded && (
              <>
                <div className={styles.expandedWrapper}>
                  {!useHighlighter ? (
                    <div style={{ paddingTop: '88px', width: '100%', display: 'flex' }}>
                      {gameConfig?.importModalConfig?.horizontalExampleVideo &&
                      gameConfig?.importModalConfig?.verticalExampleVideo ? (
                        <>
                          <div
                            className={styles.plattformIcon}
                            style={{ top: '84px', left: '120px' }}
                          >
                            <YouTubeLogo />
                          </div>
                          <div
                            className={styles.plattformIcon}
                            style={{ top: '181px', left: '32px' }}
                          >
                            <DiscordLogo />
                          </div>

                          <div
                            className={styles.plattformIcon}
                            style={{ top: '85px', left: '250px' }}
                          >
                            <TikTokLogo />
                          </div>

                          <div
                            className={styles.plattformIcon}
                            style={{ top: '177px', left: '153px' }}
                          >
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
                        </>
                      ) : (
                        <div className={styles.image}></div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.educationSection}>
                      ⚠️{$t('Game language must be English')} <br /> ⚠️
                      {$t('Game must be fullscreen')} <br /> ⚠️
                      {$t('Game mode must be supported')}
                      <span style={{ fontSize: '12px', marginLeft: '27px', marginTop: '-3px' }}>
                        {gameConfig?.gameModes && `(${gameConfig?.gameModes})`}
                      </span>
                      {/* <EducationCarousel game={game!} /> */}
                    </div>
                  )}
                  <img
                    className={`${styles.artworkImage}`}
                    src={gameConfig?.importModalConfig?.artwork}
                    alt=""
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <></>
      )}
    </div>
  );
}
