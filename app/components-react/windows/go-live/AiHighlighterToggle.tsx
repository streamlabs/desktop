import { SwitchInput } from 'components-react/shared/inputs/SwitchInput';
import React, { useEffect, useRef, useState } from 'react';
import styles from './AiHighlighterToggle.m.less';

import { Services } from 'components-react/service-provider';
import Highlighter from 'components-react/pages/Highlighter';
import { useVuex } from 'components-react/hooks';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Carousel } from 'antd';
import EducationCarousel from 'components-react/highlighter/EducationCarousel';

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

  function getInitialExpandedState() {
    if (game === 'Fortnite') {
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

  useEffect(() => {
    if (game === 'Fortnite') {
      setIsExpanded(true);
    }
    if (game !== 'Fortnite' && game !== undefined && useHighlighter) {
      HighlighterService.actions.setAiHighlighter(false);
    }
  }, [game]);

  return (
    <div>
      {game === undefined || game === 'Fortnite' ? (
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
                  <>
                    {' '}
                    Streaming <span style={{ fontWeight: 700 }}>Fortnite</span>? Try AI Highlighter!{' '}
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 700 }}>Ai Highlighter requirements</span>
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
                          Auto-create
                          <br /> highlights
                        </h2>
                        <div className={styles.betaTag}>Beta</div>
                      </div>
                      <div className={styles.image}></div>
                    </div>
                  ) : (
                    <EducationCarousel />
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
                      style={{ width: 'fit-content' }}
                      size="small"
                      type="primary"
                      onClick={() => {
                        HighlighterService.installAiHighlighter(false, 'Go-live-flow');
                      }}
                    >
                      Install AI Highlighter
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
