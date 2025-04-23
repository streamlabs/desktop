import { CommonPlatformFields } from './CommonPlatformFields';
import { useGoLiveSettings } from './useGoLiveSettings';
import { $t } from '../../../services/i18n';
import React from 'react';
import { TPlatform } from '../../../services/platforms';
import { TwitchEditStreamInfo } from './platforms/TwitchEditStreamInfo';
import { Section } from './Section';
import { YoutubeEditStreamInfo } from './platforms/YoutubeEditStreamInfo';
import { TikTokEditStreamInfo } from './platforms/TiktokEditStreamInfo';
import FacebookEditStreamInfo from './platforms/FacebookEditStreamInfo';
import { IPlatformComponentParams, TLayoutMode } from './platforms/PlatformSettingsLayout';
import { getDefined } from '../../../util/properties-type-guards';
import { TrovoEditStreamInfo } from './platforms/TrovoEditStreamInfo';
import { TwitterEditStreamInfo } from './platforms/TwitterEditStreamInfo';
import { InstagramEditStreamInfo } from './platforms/InstagramEditStreamInfo';
import { KickEditStreamInfo } from './platforms/KickEditStreamInfo';
import AdvancedSettingsSwitch from './AdvancedSettingsSwitch';

export default function PlatformSettings() {
  const {
    isMultiplatformMode,
    isDualOutputMode,
    settings,
    error,
    isAdvancedMode,
    enabledPlatforms,
    getPlatformDisplayName,
    isLoading,
    updatePlatform,
    commonFields,
    updateCommonFields,
    descriptionIsRequired,
    isUpdateMode,
    isTikTokConnected,
  } = useGoLiveSettings().extend(settings => ({
    get descriptionIsRequired() {
      const fbSettings = settings.state.platforms['facebook'];
      const descriptionIsRequired = fbSettings && fbSettings.enabled && !fbSettings.useCustomFields;
      return descriptionIsRequired;
    },

    get isTikTokConnected() {
      return settings.state.isPlatformLinked('tiktok');
    },
  }));

  const shouldShowSettings = !error && !isLoading;
  const canShowAdvancedMode = isMultiplatformMode || isDualOutputMode;

  let layoutMode: TLayoutMode;
  if (canShowAdvancedMode) {
    layoutMode = isAdvancedMode ? 'multiplatformAdvanced' : 'multiplatformSimple';
  } else {
    layoutMode = 'singlePlatform';
  }

  function createPlatformBinding<T extends TPlatform>(platform: T): IPlatformComponentParams<T> {
    return {
      isUpdateMode,
      layoutMode,
      get value() {
        return getDefined(settings.platforms[platform]);
      },
      get enabledPlatformsCount() {
        return enabledPlatforms.length;
      },
      onChange(newSettings) {
        updatePlatform(platform, newSettings);
      },
    };
  }

  return (
    // minHeight is required for the loading spinner
    <div style={{ minHeight: '150px' }}>
      {shouldShowSettings && (
        <div style={{ width: '100%' }}>
          <AdvancedSettingsSwitch />

          {/*COMMON FIELDS*/}
          {canShowAdvancedMode && (
            <Section isSimpleMode={!isAdvancedMode} title={$t('Common Stream Settings')}>
              <CommonPlatformFields
                descriptionIsRequired={descriptionIsRequired}
                value={commonFields}
                onChange={updateCommonFields}
                enabledPlatforms={enabledPlatforms}
              />
            </Section>
          )}

          {/*SETTINGS FOR EACH ENABLED PLATFORM*/}
          {enabledPlatforms.map((platform: TPlatform) => (
            <Section
              title={$t('%{platform} Settings', { platform: getPlatformDisplayName(platform) })}
              isSimpleMode={!isAdvancedMode}
              key={platform}
            >
              {platform === 'twitch' && (
                <TwitchEditStreamInfo {...createPlatformBinding('twitch')} />
              )}
              {platform === 'facebook' && (
                <FacebookEditStreamInfo {...createPlatformBinding('facebook')} />
              )}
              {platform === 'youtube' && (
                <YoutubeEditStreamInfo {...createPlatformBinding('youtube')} />
              )}
              {platform === 'tiktok' && isTikTokConnected && (
                <TikTokEditStreamInfo {...createPlatformBinding('tiktok')} />
              )}
              {platform === 'kick' && <KickEditStreamInfo {...createPlatformBinding('kick')} />}
              {platform === 'trovo' && <TrovoEditStreamInfo {...createPlatformBinding('trovo')} />}
              {platform === 'twitter' && (
                <TwitterEditStreamInfo {...createPlatformBinding('twitter')} />
              )}
              {platform === 'instagram' && (
                <InstagramEditStreamInfo {...createPlatformBinding('instagram')} />
              )}
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
