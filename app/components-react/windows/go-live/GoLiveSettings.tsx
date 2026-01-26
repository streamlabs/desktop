import React from 'react';
import styles from './GoLive.m.less';
import Scrollable from 'components-react/shared/Scrollable';
import { useGoLiveSettings } from './useGoLiveSettings';
import { $t } from 'services/i18n';
import { Row, Col } from 'antd';
import { Section } from './Section';
import PlatformSettings from './PlatformSettings';
import TwitterInput from './Twitter';
import OptimizedProfileSwitcher from './OptimizedProfileSwitcher';
import Spinner from 'components-react/shared/Spinner';
import GoLiveError from './GoLiveError';
import PrimaryChatSwitcher from './PrimaryChatSwitcher';
import ColorSpaceWarnings from './ColorSpaceWarnings';
import DualOutputToggle from 'components-react/shared/DualOutputToggle';
import { DestinationSwitchers } from './DestinationSwitchers';
import AddDestinationButton from 'components-react/shared/AddDestinationButton';
import cx from 'classnames';
import StreamShiftToggle from 'components-react/shared/StreamShiftToggle';
import { CaretDownOutlined } from '@ant-design/icons';
import Tooltip from 'components-react/shared/Tooltip';
import * as remote from '@electron/remote';
import { inject } from 'slap';
import { VideoEncodingOptimizationService } from 'services/video-encoding-optimizations';
import { MagicLinkService } from 'services/magic-link';
import { SettingsService } from 'services/settings';
import Translate from 'components-react/shared/Translate';

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
    isDualOutputMode,
    canAddDestinations,
    canUseOptimizedProfile,
    showTweet,
    hasMultiplePlatforms,
    hasMultiplePlatformsLinked,
    enabledPlatforms,
    primaryChat,
    recommendedColorSpaceWarnings,
    isPrime,
    isStreamShiftMode,
    isStreamShiftDisabled,
    isDualOutputSwitchDisabled,
    canStreamDualOutput,
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
        return linkedPlatforms.length + customDestinations.length < 8;
      },

      showSelector: !module.isPrime && module.isDualOutputMode,

      hasMultiplePlatformsLinked: module.state.linkedPlatforms.length > 1,

      isPrime: module.isPrime,

      showTweet: module.primaryPlatform && module.primaryPlatform !== 'twitter',

      isStreamShiftDisabled: module.isDualOutputMode,

      isDualOutputSwitchDisabled: module.isStreamShiftMode && !module.isDualOutputMode,

      addDestination() {
        this.settingsService.actions.showSettings('Stream');
      },

      // temporarily hide the checkbox until streaming and output settings
      // are migrated to the new API
      get canUseOptimizedProfile() {
        if (module.isDualOutputMode) return false;
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
  const shouldShowLeftCol = isDualOutputMode ? true : protectedModeEnabled;
  const shouldShowAddDestButton = canAddDestinations;

  const shouldShowPrimaryChatSwitcher =
    hasMultiplePlatforms || (isDualOutputMode && hasMultiplePlatformsLinked);

  const headerText = isDualOutputMode ? $t('Destinations & Outputs:') : $t('Destinations:');

  const featureCheckboxWidth = isPrime ? 140 : 155;

  return (
    <Row gutter={16} className={styles.settingsRow}>
      {/*LEFT COLUMN*/}
      {shouldShowLeftCol && (
        <Col span={9} className={styles.leftColumn}>
          {isDualOutputMode && (
            <div className={cx(styles.dualOutputAlert, { [styles.error]: !canStreamDualOutput })}>
              <Translate message="<dualoutput>Dual Output</dualoutput> is enabled - you must stream to one horizontal and one vertical platform">
                <u slot="dualoutput" />
              </Translate>
            </div>
          )}
          <div
            className={cx(styles.columnContent, {
              [styles.dualOutput]: isDualOutputMode,
              [styles.alertClosed]: isDualOutputMode,
              [styles.alertOpen]: isDualOutputMode && !canStreamDualOutput,
            })}
          >
            <div className={cx(styles.columnHeader, { [styles.ultraColumnHeader]: isPrime })}>
              {headerText}
            </div>
            {!isPrime && <AddDestinationButton type="banner" className={styles.addDestination} />}

            <Scrollable className={styles.switcherWrapper}>
              <DestinationSwitchers />
            </Scrollable>
          </div>

          {shouldShowAddDestButton && (
            <AddDestinationButton
              type="small"
              className={styles.columnPadding}
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

            <div className={cx(styles.toggleWrapper, { [styles.shiftEnabled]: isStreamShiftMode })}>
              <Tooltip
                title={$t('Dual Output cannot be used with Stream Shift')}
                placement="top"
                lightShadow={true}
                disabled={isDualOutputSwitchDisabled || !isPrime}
              >
                <DualOutputToggle
                  className={styles.featureToggle}
                  checkboxClassname={styles.featureCheckbox}
                  style={{ paddingBottom: '10px', width: featureCheckboxWidth }}
                  disabled={isStreamShiftMode}
                  tooltipDisabled={isStreamShiftMode}
                  label={$t('Dual Output')}
                  type="single"
                  lightShadow
                />
              </Tooltip>
              <Tooltip
                title={
                  isPrime
                    ? $t('Stream Shift cannot be used with Dual Output')
                    : $t('Upgrade to Ultra to switch streams between devices.')
                }
                placement="top"
                lightShadow={true}
                disabled={isPrime && !isStreamShiftDisabled}
              >
                <StreamShiftToggle
                  className={styles.featureToggle}
                  checkboxClassname={styles.featureCheckbox}
                  style={{ width: featureCheckboxWidth }}
                  disabled={isStreamShiftDisabled || !isPrime}
                />
              </Tooltip>
            </div>
          </div>
        </Col>
      )}

      {/*RIGHT COLUMN*/}
      <Col
        span={shouldShowLeftCol ? 15 : 24}
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
                <Section isSimpleMode={!isAdvancedMode} title={$t('Extras')}>
                  <OptimizedProfileSwitcher />
                </Section>
              )}

              {/* Spacer is as  scrollable padding-bottom */}
              <div className={styles.spacer} />
            </Scrollable>
            {showTweet && <TwitterInput />}
          </>
        )}
      </Col>
    </Row>
  );
}
