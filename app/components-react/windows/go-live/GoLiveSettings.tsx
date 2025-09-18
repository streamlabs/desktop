import React from 'react';
import styles from './GoLive.m.less';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from 'components-react/service-provider';
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
import CloudShiftToggle from 'components-react/shared/CloudShiftToggle';
import { CaretDownOutlined } from '@ant-design/icons';
import Tooltip from 'components-react/shared/Tooltip';

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
    isCloudShiftMode,
    isCloudShiftDisabled,
    isDualOutputSwitchDisabled,
    setPrimaryChat,
  } = useGoLiveSettings().extend(module => {
    const { UserService, VideoEncodingOptimizationService, SettingsService } = Services;

    return {
      get canAddDestinations() {
        const linkedPlatforms = module.state.linkedPlatforms;
        const customDestinations = module.state.customDestinations;
        return linkedPlatforms.length + customDestinations.length < 8;
      },

      showSelector: !UserService.views.isPrime && module.isDualOutputMode,

      hasMultiplePlatformsLinked: module.state.linkedPlatforms.length > 1,

      isPrime: UserService.views.isPrime,

      showTweet: UserService.views.auth?.primaryPlatform !== 'twitter',

      isCloudShiftDisabled: module.isDualOutputMode,

      isDualOutputSwitchDisabled: module.isCloudShiftMode && !module.isDualOutputMode,

      addDestination() {
        SettingsService.actions.showSettings('Stream');
      },

      // temporarily hide the checkbox until streaming and output settings
      // are migrated to the new API
      canUseOptimizedProfile: !module.isDualOutputMode
        ? VideoEncodingOptimizationService.state.canSeeOptimizedProfile ||
          VideoEncodingOptimizationService.state.useOptimizedProfile
        : false,
      // canUseOptimizedProfile:
      //   VideoEncodingOptimizationService.state.canSeeOptimizedProfile ||
      //   VideoEncodingOptimizationService.state.useOptimizedProfile,
    };
  });

  const shouldShowSettings = !error && !isLoading;
  const shouldShowLeftCol = isDualOutputMode ? true : protectedModeEnabled;
  const shouldShowAddDestButton = canAddDestinations;

  const shouldShowPrimaryChatSwitcher =
    hasMultiplePlatforms || (isDualOutputMode && hasMultiplePlatformsLinked);

  const headerText = isDualOutputMode ? $t('Destinations & Outputs:') : $t('Destinations:');

  const height = isPrime ? '61%' : '50%';

  return (
    <Row gutter={16} className={styles.settingsRow}>
      {/*LEFT COLUMN*/}
      {shouldShowLeftCol && (
        <Col span={9} className={styles.leftColumn}>
          {!isPrime && <AddDestinationButton type="banner" className={styles.addDestination} />}
          <div className={styles.columnHeader} style={{ paddingTop: '15px' }}>
            {headerText}
          </div>

          <Scrollable style={{ height }}>
            <DestinationSwitchers />
          </Scrollable>

          {shouldShowAddDestButton && (
            <AddDestinationButton
              type="small"
              className={styles.columnPadding}
              onClick={() => Services.SettingsService.actions.showSettings('Stream')}
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

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <Tooltip
                title={$t('Dual Output cannot be used with Cloud Shift')}
                placement="top"
                lightShadow={true}
                disabled={isDualOutputSwitchDisabled || !isPrime}
              >
                <DualOutputToggle
                  className={styles.featureToggle}
                  checkboxClassname={styles.featureCheckbox}
                  style={{ paddingBottom: '10px' }}
                  disabled={isCloudShiftMode}
                  tooltipDisabled={isCloudShiftMode}
                  label={$t('Dual Output')}
                  type="single"
                  lightShadow
                />
              </Tooltip>
              <Tooltip
                title={
                  isPrime
                    ? $t('Cloud Shift cannot be used with Dual Output')
                    : $t('Upgrade to Ultra to switch streams between devices.')
                }
                placement="top"
                lightShadow={true}
                disabled={isPrime && !isCloudShiftDisabled}
              >
                <CloudShiftToggle
                  className={styles.featureToggle}
                  checkboxClassname={styles.featureCheckbox}
                  disabled={isCloudShiftDisabled || !isPrime}
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
        <Spinner visible={isLoading} relative />
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
