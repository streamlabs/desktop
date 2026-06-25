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
import { TrovoEditStreamInfo } from './platforms/TrovoEditStreamInfo';
import { TwitterEditStreamInfo } from './platforms/TwitterEditStreamInfo';
import { InstagramEditStreamInfo } from './platforms/InstagramEditStreamInfo';
import { KickEditStreamInfo } from './platforms/KickEditStreamInfo';
import { PatreonEditStreamInfo } from './platforms/PatreonEditStreamInfo';
import { TInputLayout } from 'components-react/shared/inputs';
import { inject } from 'slap';
import { HighlighterService } from 'app-services';
import { SwitcherCard } from './SwitcherCard';
import UltraIcon from 'components-react/shared/UltraIcon';

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
    isTikTokConnected,
    layout,
    isDualOutputMode,
    isAiHighlighterEnabled,
    isStreamShiftMode,
    isStreamShiftDisabled,
    isPatreonEnabled,
    isLiveOutputEditingEnabled,
    enabledPlatformsCount,
    isMidStreamMode,
    isPrime,
    setStreamShift,
    setLiveOutputEditingEnabled,
    canEditLiveOutputs,
  } = useGoLiveSettings().extend(settings => ({
    highlighterService: inject(HighlighterService),

    get descriptionIsRequired() {
      const fbSettings = settings.state.platforms['facebook'];
      const descriptionIsRequired = fbSettings && fbSettings.enabled && !fbSettings.useCustomFields;
      return descriptionIsRequired;
    },

    get isTikTokConnected() {
      return settings.isPlatformLinked('tiktok');
    },

    get layout(): TInputLayout {
      return 'vertical';
    },

    get isAiHighlighterEnabled() {
      return this.highlighterService.aiHighlighterFeatureEnabled;
    },

    get isPatreonEnabled() {
      return settings.enabledPlatforms.some(p => p === 'patreon');
    },

    get isStreamShiftDisabled() {
      return !settings.isPrime || settings.enabledPlatforms.some(p => p === 'patreon');
    },

    get enabledPlatformsCount() {
      return settings.enabledPlatforms.length;
    },
  }));

  const layoutMode = 'multiplatformAdvanced';

  const liveOutputTooltip = useMemo(() => {
    if (!isPrime) {
      return $t('Upgrade to Ultra to manage live outputs mid-stream.');
    }

    return '';
  }, [isPrime]);

  const streamShiftTooltip = useMemo(() => {
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
  }, [isPrime, isPatreonEnabled, isDualOutputMode]);

  const disableStreamShiftTooltip = useMemo(() => isPrime && !isStreamShiftDisabled, [
    isPrime,
    isStreamShiftDisabled,
  ]);

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
    [settings, updatePlatform],
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
              onClick={() => setLiveOutputEditingEnabled(!isLiveOutputEditingEnabled)}
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
              disabled={!isPrime}
              tooltip={liveOutputTooltip}
              tooltipDisabled={isPrime}
            />
            <SwitcherCard
              onClick={() => setStreamShift(!isStreamShiftMode)}
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
              disabled={!isPrime}
              tooltip={streamShiftTooltip}
              tooltipDisabled={disableStreamShiftTooltip}
            />
          </div>
        </>
      )}

      <h2>{$t('Channel Settings')}</h2>

      {/*COMMON FIELDS*/}
      <Section>
        <CommonPlatformFields
          descriptionIsRequired={descriptionIsRequired}
          value={commonFields}
          onChange={handleChange}
          enabledPlatforms={enabledPlatforms}
          layout={layout}
        />
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
          {platform === 'tiktok' && isTikTokConnected && (
            <TikTokEditStreamInfo {...createPlatformBinding('tiktok')} layout={layout} />
          )}
          {platform === 'kick' && (
            <KickEditStreamInfo {...createPlatformBinding('kick')} layout={layout} />
          )}
          {platform === 'patreon' && (
            <PatreonEditStreamInfo {...createPlatformBinding('patreon')} layout={layout} />
          )}
          {platform === 'trovo' && (
            <TrovoEditStreamInfo {...createPlatformBinding('trovo')} layout={layout} />
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
