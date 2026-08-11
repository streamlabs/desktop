import React from 'react';
import cx from 'classnames';
import { $t } from 'services/i18n';
import styles from './HypeWrapper.m.less';
import PlatformLogo from 'components-react/shared/PlatformLogo';

type GameConfig = ReturnType<
  typeof import('services/highlighter/models/game-config.models').getConfigByGame
>;

interface HypeWrapperProps {
  gameConfig: GameConfig;
  isAnimating: boolean;
  artwork: string | undefined;
  children: React.ReactNode;
}

export function HypeWrapper({ gameConfig, isAnimating, artwork, children }: HypeWrapperProps) {
  return (
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
                    <PlatformLogo platform="youtube" size={30} />
                  </div>
                  <div className={styles.plattformIcon} style={{ top: '182px', left: '32px' }}>
                    <DiscordLogo />
                  </div>
                  <div className={styles.plattformIcon} style={{ top: '243px', left: '290px' }}>
                    <PlatformLogo platform="tiktok" size={30} />
                  </div>
                  <div className={styles.plattformIcon} style={{ top: '283px', left: '153px' }}>
                    <PlatformLogo platform="instagram" size={30} />
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
        {children}
      </div>
    </div>
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
