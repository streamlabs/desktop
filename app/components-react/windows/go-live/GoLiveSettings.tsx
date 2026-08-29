import React, { useMemo } from 'react';
import styles from './GoLive.m.less';
import Scrollable from 'components-react/shared/Scrollable';
import { useGoLiveSettings } from './useGoLiveSettings';
import { $t } from 'services/i18n';
import { Row, Col } from 'antd';
import { Section } from './Section';
import PlatformSettings from './PlatformSettings';
import OptimizedProfileSwitcher from './OptimizedProfileSwitcher';
import Spinner from 'components-react/shared/Spinner';
import GoLiveError from './GoLiveError';
import PrimaryChatSwitcher from './PrimaryChatSwitcher';
import ColorSpaceWarnings from './ColorSpaceWarnings';
import { DestinationSwitchers } from './DestinationSwitchers';
import AddDestinationButton from 'components-react/shared/AddDestinationButton';
import cx from 'classnames';
import StreamShiftToggle from 'components-react/shared/StreamShiftToggle';
import { CaretDownOutlined } from '@ant-design/icons';
import * as remote from '@electron/remote';
import { inject } from 'slap';
import { VideoEncodingOptimizationService } from 'services/video-encoding-optimizations';
import { MagicLinkService } from 'services/magic-link';
import { SettingsService } from 'services/settings';

/**
 * Renders settings for starting the stream
 * - Platform switchers
 * - Settings for each platform
 * - Extras settings
 **/
export default function GoLiveSettings() {
  const {
    isLoading,
    canUseOptimizedProfile,
    hasMultiplePlatforms,
    enabledPlatforms,
    primaryChat,
    recommendedColorSpaceWarnings,
    isPrime,
    shouldShowLeftCol,
    isStreamShiftDisabled,
    isUpdateMode,
    addDestination,
    showTopAddDestination,
    showBottomAddDestination,
    shouldShowSettings,
    setPrimaryChat,
  } = useGoLiveSettings().extend(module => {
    return {
      videoEncodingOptimizationService: inject(VideoEncodingOptimizationService),
      settingsService: inject(SettingsService),
      magicLinkService: inject(MagicLinkService),

      addDestination() {
        this.settingsService.actions.showSettings('Stream');
      },

      // temporarily hide the checkbox until streaming and output settings
      // are migrated to the new API
      get canUseOptimizedProfile() {
        return (
          this.videoEncodingOptimizationService.state.canSeeOptimizedProfile ||
          this.videoEncodingOptimizationService.state.useOptimizedProfile
        );
      },

      get shouldShowSettings() {
        return !module.error && !module.isLoading;
      },

      get shouldShowLeftCol() {
        if (module.isUpdateMode) return false;
        return module.isStreamShiftMode ? true : module.protectedModeEnabled;
      },

      async openPlatformSettings() {
        try {
          const link = await this.magicLinkService.getDashboardMagicLink(
            'settings/account-settings/platforms',
          );
          remote.shell.openExternal(link);
        } catch (e: unknown) {
          console.error('Error generating platform settings magic link', e);
        }
      },
    };
  });

  const headerText = $t('Destinations');

  const featureCheckboxWidth = isPrime ? 130 : 135;

  return (
    <Row gutter={8} className={styles.goLiveSettings}>
      {/*LEFT COLUMN*/}
      {shouldShowLeftCol && (
        <Col span={7} className={styles.leftColumn}>
          <h2>{headerText}</h2>
          {!isPrime && (
            <AddDestinationButton type="banner" className={styles.addDestinationBanner} />
          )}

          <Scrollable className={cx(styles.leftColumnScroll, { [styles.nonUltra]: !isPrime })}>
            {showTopAddDestination && (
              <AddDestinationButton
                name="top-add-destination"
                type="small"
                onClick={addDestination}
              />
            )}
            <DestinationSwitchers />
            {showBottomAddDestination && (
              <AddDestinationButton
                name="bottom-add-destination"
                type="small"
                className={styles.bottom}
                onClick={addDestination}
              />
            )}
            <div className={styles.leftFooter}>
              <PrimaryChatSwitcher
                className={cx(styles.primaryChat, {
                  [styles.disabled]: !hasMultiplePlatforms,
                })}
                enabledPlatforms={enabledPlatforms}
                onSetPrimaryChat={setPrimaryChat}
                primaryChat={primaryChat}
                suffixIcon={<CaretDownOutlined />}
                layout="horizontal"
                logo={false}
                border={false}
                disabled={!hasMultiplePlatforms}
              />
              <StreamShiftToggle
                style={{ width: featureCheckboxWidth }}
                disabled={isStreamShiftDisabled}
              />
            </div>
          </Scrollable>
        </Col>
      )}

      {/*RIGHT COLUMN*/}
      <Col
        span={shouldShowLeftCol ? 17 : 24}
        className={cx(styles.rightColumn, {
          [styles.destinationMode]: !shouldShowLeftCol && !isUpdateMode,
          [styles.updateMode]: isUpdateMode,
        })}
      >
        <Spinner visible={isLoading} relative />
        <GoLiveError />
        {shouldShowSettings && (
          <Scrollable className={styles.rightColumnScroll}>
            {recommendedColorSpaceWarnings && (
              <ColorSpaceWarnings warnings={recommendedColorSpaceWarnings} />
            )}
            {/*PLATFORM SETTINGS*/}
            <PlatformSettings />
            {/*EXTRAS*/}
            {!!canUseOptimizedProfile && !isUpdateMode && (
              <Section title={$t('Extras')}>
                <OptimizedProfileSwitcher />
              </Section>
            )}
          </Scrollable>
        )}
      </Col>
    </Row>
  );
}
