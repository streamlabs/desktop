import React, { useMemo, useCallback } from 'react';
import { CommonPlatformFields } from './CommonPlatformFields';
import { useGoLiveSettings } from './useGoLiveSettings';
import { $t } from '../../../services/i18n';
import { TPlatform } from '../../../services/platforms';
import { TwitchEditStreamInfo } from './platforms/TwitchEditStreamInfo';
import { Section } from './Section';
import { YoutubeEditStreamInfo } from './platforms/YoutubeEditStreamInfo';
import { TikTokEditStreamInfo } from './platforms/TiktokEditStreamInfo';
import { FacebookEditStreamInfo } from './platforms/FacebookEditStreamInfo';
import { IPlatformComponentParams } from './platforms/PlatformSettingsLayout';
import { getDefined } from '../../../util/properties-type-guards';
import { TwitterEditStreamInfo } from './platforms/TwitterEditStreamInfo';
import { InstagramEditStreamInfo } from './platforms/InstagramEditStreamInfo';
import { KickEditStreamInfo } from './platforms/KickEditStreamInfo';
import { PatreonEditStreamInfo } from './platforms/PatreonEditStreamInfo';
import { TInputLayout } from 'components-react/shared/inputs';
import { SwitcherCard } from './SwitcherCard';
import UltraIcon from 'components-react/shared/UltraIcon';
import PrimaryChatSwitcher from './PrimaryChatSwitcher';
import { CaretDownOutlined } from '@ant-design/icons';
import { Services } from 'components-react/service-provider';

export default function PlatformSettings() {
  const {
    settings,
    enabledPlatforms,
    getPlatformDisplayName,
    updatePlatform,
    commonFields,
    updateCommonFields,
    descriptionIsRequired,
    isUpdateMode,
    layout,
    isDualOutputMode,
    isAiHighlighterEnabled,
    isStreamShiftMode,
    isStreamShiftDisabled,
    isPatreonEnabled,
    isLiveOutputEditingEnabled,
    isLiveOutputEditingDisabled,
    enabledPlatformsCount,
    isMidStreamMode,
    isPrime,
    primaryChat,
    hasMultiplePlatforms,
    setPrimaryChat,
    setStreamShift,
    setLiveOutputEditingEnabled,
    canEditLiveOutputs,
    liveOutputTooltip,
    streamShiftTooltip,
    disableStreamShiftTooltip,
  } = useGoLiveSettings().extend(settings => ({
    get descriptionIsRequired() {
      const fbSettings = settings.state.platforms['facebook'];
      return fbSettings && fbSettings.enabled && !fbSettings.useCustomFields;
    },

    get layout(): TInputLayout {
      return 'vertical';
    },

    get liveOutputTooltip() {
      if (!isPrime) {
        return $t('Upgrade to Ultra to manage live outputs mid-stream.');
      }

      return '';
    },

    get streamShiftTooltip() {
      if (isPatreonEnabled) {
        return $t('Stream Shift cannot be used with Patreon');
      }

      if (!isPrime) {
        return $t('Upgrade to Ultra to switch streams between devices.');
      }

      if (isDualOutputMode) {
        return $t('Stream Shift cannot be used with Dual Output');
      }

      return '';
    },

    get disableStreamShiftTooltip() {
      return settings.isPrime && !settings.isStreamShiftDisabled;
    },
  }));

  const layoutMode = 'multiplatformAdvanced';

  const handleToggleStreamShift = useCallback(
    (status?: boolean) => {
      if (!isPrime) {
        // TODO: Comment in when ready
        // Services.MagicLinkService.actions.linkToPrime('slobs-streamswitcher', {
        //   event: 'StreamShift',
        // });
        return;
      }

      setStreamShift(status ?? !isStreamShiftMode);
      Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamShift', {
        toggle: status ?? !isStreamShiftMode,
      });
    },
    [setStreamShift, isStreamShiftMode],
  );

  const handleToggleLiveOutputEditing = useCallback(
    (status?: boolean) => {
      if (!isPrime) {
        // TODO: Comment in when ready
        // Services.MagicLinkService.actions.linkToPrime('slobs-live-output-editing', {
        //   event: 'LiveOutputEditing',
        // });
        return;
      }

      setLiveOutputEditingEnabled(status ?? !isLiveOutputEditingEnabled);
      Services.UsageStatisticsService.actions.recordAnalyticsEvent('LiveOutputEditing', {
        toggle: status ?? !isLiveOutputEditingEnabled,
      });
    },
    [setLiveOutputEditingEnabled, isLiveOutputEditingEnabled],
  );

  const createPlatformBinding = useCallback(
    <T extends TPlatform>(platform: T): IPlatformComponentParams<T> => {
      return {
        isUpdateMode,
        layoutMode,
        isDualOutputMode,
        isStreamShiftMode,
        isAiHighlighterEnabled,
        isMidStreamMode,
        enabledPlatformsCount,
        get value() {
          return getDefined(settings.platforms[platform]);
        },
        onChange(newSettings) {
          updatePlatform(platform, newSettings);
        },
      };
    },
    [
      settings,
      updatePlatform,
      isUpdateMode,
      layoutMode,
      isDualOutputMode,
      isStreamShiftMode,
      isAiHighlighterEnabled,
      isMidStreamMode,
      enabledPlatformsCount,
    ],
  );

  const handleChange = useCallback(
    val => {
      updateCommonFields(val);
    },
    [updateCommonFields],
  );

  return (
    // minHeight is required for the loading spinner
    <div style={{ minHeight: '150px', height: '100%', flex: 1 }}>
      {canEditLiveOutputs && (
        <>
          <h2>{$t('Live Settings')}</h2>
          <div className="flex__horizontal margin">
            <SwitcherCard
              onClick={() => handleToggleLiveOutputEditing()}
              value={isLiveOutputEditingEnabled}
              title={
                <>
                  {$t('Live output editing')}
                  {!isPrime && <UltraIcon type="badge" style={{ marginLeft: '5px' }} />}
                </>
              }
              name="liveOutput"
              description={$t('Manage output destinations mid-stream.')}
              icon="icon-output"
              disabled={isLiveOutputEditingDisabled}
              tooltip={liveOutputTooltip}
              tooltipDisabled={isPrime}
            />
            <SwitcherCard
              onClick={() => handleToggleStreamShift()}
              value={isStreamShiftMode}
              title={
                <>
                  {$t('Stream Shift')}
                  {!isPrime && <UltraIcon type="badge" style={{ marginLeft: '5px' }} />}
                </>
              }
              name="streamShift"
              description={$t('Switch between devices while live.')}
              icon="icon-repeat-2"
              disabled={isStreamShiftDisabled}
              tooltip={streamShiftTooltip}
              tooltipDisabled={disableStreamShiftTooltip}
            />
          </div>
        </>
      )}

      <h2 style={{ marginTop: '15px' }}>{$t('Channel Settings')}</h2>

      {/*COMMON FIELDS*/}
      <Section key="common">
        <CommonPlatformFields
          descriptionIsRequired={descriptionIsRequired}
          value={commonFields}
          onChange={handleChange}
          enabledPlatforms={enabledPlatforms}
          layout={layout}
        />
        {/* TODO: Remove when left column implemented */}
        {isUpdateMode && hasMultiplePlatforms && (
          <PrimaryChatSwitcher
            enabledPlatforms={enabledPlatforms}
            onSetPrimaryChat={setPrimaryChat}
            primaryChat={primaryChat}
            suffixIcon={<CaretDownOutlined />}
            layout="vertical"
            logo={false}
          />
        )}
      </Section>

      {/*SETTINGS FOR EACH ENABLED PLATFORM*/}
      {enabledPlatforms.map((platform: TPlatform) => (
        <Section
          title={$t('%{platform} Settings', { platform: getPlatformDisplayName(platform) })}
          key={platform}
        >
          {platform === 'twitch' && (
            <TwitchEditStreamInfo {...createPlatformBinding('twitch')} layout={layout} />
          )}
          {platform === 'facebook' && (
            <FacebookEditStreamInfo {...createPlatformBinding('facebook')} layout={layout} />
          )}
          {platform === 'youtube' && (
            <YoutubeEditStreamInfo {...createPlatformBinding('youtube')} layout={layout} />
          )}
          {platform === 'tiktok' && (
            <TikTokEditStreamInfo {...createPlatformBinding('tiktok')} layout={layout} />
          )}
          {platform === 'kick' && (
            <KickEditStreamInfo {...createPlatformBinding('kick')} layout={layout} />
          )}
          {platform === 'patreon' && (
            <PatreonEditStreamInfo {...createPlatformBinding('patreon')} layout={layout} />
          )}
          {platform === 'twitter' && (
            <TwitterEditStreamInfo {...createPlatformBinding('twitter')} layout={layout} />
          )}
          {platform === 'instagram' && (
            <InstagramEditStreamInfo {...createPlatformBinding('instagram')} layout={layout} />
          )}
        </Section>
      ))}
    </div>
  );
}
