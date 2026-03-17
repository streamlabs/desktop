import React from 'react';
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
import { maxNumPlatforms } from 'services/platforms';

/**
 * Renders settings for starting the stream
 * - Platform switchers
 * - Settings for each platform
 * - Extras settings
 **/
export default function GoLiveSettings() {
  const {
    isAdvancedMode,
    protectedModeEnabled,
    error,
    isLoading,
    canUseOptimizedProfile,
    hasMultiplePlatforms,
    enabledPlatforms,
    primaryChat,
    recommendedColorSpaceWarnings,
    isPrime,
    isStreamShiftMode,
    showTopAddDestination,
    showBottomAddDestination,
    setPrimaryChat,
    openPlatformSettings,
  } = useGoLiveSettings().extend(module => {
    return {
      videoEncodingOptimizationService: inject(VideoEncodingOptimizationService),
      settingsService: inject(SettingsService),
      magicLinkService: inject(MagicLinkService),

      get canAddDestinations() {
        const linkedPlatforms = module.state.linkedPlatforms;
        const customDestinations = module.state.customDestinations;
        return linkedPlatforms.length + customDestinations.length < maxNumPlatforms + 5;
      },

      get showTopAddDestination() {
        return this.canAddDestinations && module.state.linkedPlatforms.length > 1;
      },

      get showBottomAddDestination() {
        return module.state.linkedPlatforms.length < 2;
      },

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

        // canUseOptimizedProfile:
        //   VideoEncodingOptimizationService.state.canSeeOptimizedProfile ||
        //   VideoEncodingOptimizationService.state.useOptimizedProfile,
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

  const shouldShowSettings = !error && !isLoading;
  const shouldShowLeftCol = isStreamShiftMode ? true : protectedModeEnabled;

  const shouldShowPrimaryChatSwitcher = hasMultiplePlatforms;

  const headerText = $t('Destinations');

  const featureCheckboxWidth = isPrime ? 140 : 155;

  return (
    <Row gutter={16} className={styles.settingsRow}>
      {/*LEFT COLUMN*/}
      {shouldShowLeftCol && (
        <Col span={8} className={styles.leftColumn}>
          <div className={styles.columnContent}>
            <div className={cx(styles.columnHeader, { [styles.ultraColumnHeader]: isPrime })}>
              {headerText}
            </div>
            {!isPrime && (
              <AddDestinationButton type="banner" className={styles.addDestinationBanner} />
            )}

            <Scrollable className={styles.switcherWrapper}>
              {showTopAddDestination && (
                <AddDestinationButton
                  type="small"
                  className={styles.columnPadding}
                  onClick={openPlatformSettings}
                />
              )}
              <DestinationSwitchers />
              {showBottomAddDestination && (
                <AddDestinationButton
                  type="small"
                  className={cx(styles.columnPadding, styles.bottom)}
                  onClick={openPlatformSettings}
                />
              )}
              <div className={styles.leftFooter}>
                <PrimaryChatSwitcher
                  className={cx(styles.primaryChat, {
                    [styles.disabled]: !shouldShowPrimaryChatSwitcher,
                  })}
                  enabledPlatforms={enabledPlatforms}
                  onSetPrimaryChat={setPrimaryChat}
                  primaryChat={primaryChat}
                  suffixIcon={<CaretDownOutlined />}
                  layout="horizontal"
                  logo={false}
                  border={false}
                  disabled={!shouldShowPrimaryChatSwitcher}
                />

                <StreamShiftToggle
                  checkboxClassname={styles.featureCheckbox}
                  style={{ width: featureCheckboxWidth }}
                />
              </div>
            </Scrollable>
          </div>
        </Col>
      )}

      {/*RIGHT COLUMN*/}
      <Col
        span={shouldShowLeftCol ? 16 : 24}
        className={cx(styles.rightColumn, !shouldShowLeftCol && styles.destinationMode)}
      >
        <Spinner visible={isLoading} />
        <GoLiveError />
        {shouldShowSettings && (
          <>
            <Scrollable style={{ height: '92%' }} snapToWindowEdge>
              {recommendedColorSpaceWarnings && (
                <ColorSpaceWarnings warnings={recommendedColorSpaceWarnings} />
              )}
              {/*PLATFORM SETTINGS*/}
              <PlatformSettings />
              {/*ADD SOME SPACE IN ADVANCED MODE*/}
              {isAdvancedMode && <div className={styles.spacer} />}
              {/*EXTRAS*/}
              {!!canUseOptimizedProfile && (
                <Section isSimpleMode={false} title={$t('Extras')}>
                  <OptimizedProfileSwitcher />
                </Section>
              )}

              {/* Spacer is as  scrollable padding-bottom */}
              <div className={styles.spacer} />
            </Scrollable>
          </>
        )}
      </Col>
    </Row>
  );
}
