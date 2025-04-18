import { SwitchInput } from 'components-react/shared/inputs/SwitchInput';
import React, { useEffect, useRef, useState } from 'react';
import styles from './AiHighlighterToggle.m.less';

import { Services } from 'components-react/service-provider';
import Highlighter from 'components-react/pages/Highlighter';
import { useVuex } from 'components-react/hooks';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Carousel } from 'antd';
import EducationCarousel from 'components-react/highlighter/EducationCarousel';
import { isGameSupported } from 'services/highlighter/models/game-config.models';
import { $t } from 'services/i18n';

export default function AiHighlighterToggle({
  game,
  cardIsExpanded,
}: {
  game: string | undefined;
  cardIsExpanded: boolean;
}) {
  //TODO M: Probably good way to integrate the highlighter in to GoLiveSettings
  const { HighlighterService } = Services;
  const { useHighlighter, highlighterVersion } = useVuex(() => {
    return {
      useHighlighter: HighlighterService.views.useAiHighlighter,
      highlighterVersion: HighlighterService.views.highlighterVersion,
    };
  });

  const [gameIsSupported, setGameIsSupported] = useState(false);

  useEffect(() => {
    const supportedGame = isGameSupported(game);
    setGameIsSupported(supportedGame);
    if (supportedGame) {
      setIsExpanded(true);
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
            width: '100%',
          }}
        >
          <div style={{ flexGrow: 0, backgroundColor: 'red' }}></div>

          <div className={styles.aiHighlighterBox}>
            <div className={styles.headlineWrapper} onClick={() => setIsExpanded(!isExpanded)}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 300, color: '#BDC2C4' }}>
                {!useHighlighter ? (
                  <>{$t('Try AI Highlighter to generate game highlight reels of your stream')}</>
                ) : (
                  <>
                    <span style={{ fontWeight: 700 }}>{$t('AI Highlighter requirements')}</span>
                  </>
                )}
              </h3>
              {isExpanded ? (
                <UpOutlined style={{ color: '#BDC2C4' }} />
              ) : (
                <DownOutlined style={{ color: '#BDC2C4' }} />
              )}
            </div>
            {isExpanded && (
              <>
                <div className={styles.expandedWrapper}>
                  {!useHighlighter ? (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        paddingRight: '32px',
                        paddingLeft: '32px',
                        height: '100%',
                      }}
                    >
                      <div>
                        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>
                          {$t('Auto-create highlights')}
                        </h2>
                        <div className={styles.betaTag}>{$t('Beta')}</div>
                      </div>
                      <div className={styles.image}></div>
                    </div>
                  ) : (
                    <EducationCarousel game={game!} />
                  )}

                  {highlighterVersion !== '' ? (
                    <SwitchInput
                      style={{ width: '80px', margin: 0 }}
                      value={useHighlighter}
                      label=""
                      onChange={() => HighlighterService.actions.toggleAiHighlighter()}
                    />
                  ) : (
                    <Button
                      style={{ width: 'fit-content', marginLeft: '18px' }}
                      size="small"
                      type="primary"
                      onClick={() => {
                        HighlighterService.installAiHighlighter(false, 'Go-live-flow');
                      }}
                    >
                      {$t('Install AI Highlighter')}
                    </Button>
                  )}
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
