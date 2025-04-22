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
    showSelector,
    showTweet,
    hasMultiplePlatforms,
    enabledPlatforms,
    primaryChat,
    recommendedColorSpaceWarnings,
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

      isPrime: UserService.views.isPrime,

      showTweet: UserService.views.auth?.primaryPlatform !== 'twitter',

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

  const shouldShowPrimaryChatSwitcher = hasMultiplePlatforms;

  return (
    <Row gutter={16} className={styles.settingsRow}>
      {/*LEFT COLUMN*/}
      {shouldShowLeftCol && (
        <Col
          span={8}
          className={cx(styles.leftColumn, { [styles.columnPadding]: !isDualOutputMode })}
        >
          <Scrollable style={{ height: '81%' }}>
            <DualOutputToggle
              className={cx(styles.dualOutputToggle, styles.columnPadding)}
              type="single"
              lightShadow
            />
            {/*DESTINATION SWITCHERS*/}
            <DestinationSwitchers />

            {/*ADD DESTINATION BUTTON*/}
            {shouldShowAddDestButton && !showSelector && <AddDestinationButton />}
          </Scrollable>

          {shouldShowPrimaryChatSwitcher && (
            <PrimaryChatSwitcher
              className={styles.columnPadding}
              enabledPlatforms={enabledPlatforms}
              onSetPrimaryChat={setPrimaryChat}
              primaryChat={primaryChat}
            />
          )}
        </Col>
      )}

      {/*RIGHT COLUMN*/}
      <Col
        span={shouldShowLeftCol ? 16 : 24}
        className={cx(styles.rightColumn, !shouldShowLeftCol && styles.destinationMode)}
      >
        <Spinner visible={isLoading} relative />
        <GoLiveError />
        {shouldShowSettings && (
          <Scrollable style={{ height: '100%' }} snapToWindowEdge>
            {recommendedColorSpaceWarnings && (
              <ColorSpaceWarnings warnings={recommendedColorSpaceWarnings} />
            )}
            {/*PLATFORM SETTINGS*/}
            <PlatformSettings />
            {/*ADD SOME SPACE IN ADVANCED MODE*/}
            {isAdvancedMode && <div className={styles.spacer} />}
            {/*EXTRAS*/}
            <Section isSimpleMode={!isAdvancedMode} title={$t('Extras')}>
              {showTweet && <TwitterInput />}
              {!!canUseOptimizedProfile && <OptimizedProfileSwitcher />}
            </Section>
          </Scrollable>
        )}
      </Col>
    </Row>
  );
}
