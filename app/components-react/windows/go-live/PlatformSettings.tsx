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
import { TInputLayout } from 'components-react/shared/inputs';

export default function PlatformSettings() {
  const {
    canShowAdvancedMode,
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
    layout,
  } = useGoLiveSettings().extend(settings => ({
    get descriptionIsRequired() {
      const fbSettings = settings.state.platforms['facebook'];
      const descriptionIsRequired = fbSettings && fbSettings.enabled && !fbSettings.useCustomFields;
      return descriptionIsRequired;
    },

    get isTikTokConnected() {
      return settings.state.isPlatformLinked('tiktok');
    },

    get layout(): TInputLayout {
      return settings.isAdvancedMode ? 'horizontal' : 'vertical';
    },
  }));

  const shouldShowSettings = !error && !isLoading;

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
    <div style={{ minHeight: '150px', flex: 1 }}>
      {shouldShowSettings && (
        <div style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              fontSize: '16px',
            }}
          >
            <div>{$t('Stream Information:')}</div>
            <AdvancedSettingsSwitch />
          </div>

          {/*COMMON FIELDS*/}
          {canShowAdvancedMode && (
            <Section isSimpleMode={!isAdvancedMode} title={$t('Common Stream Settings')}>
              <CommonPlatformFields
                descriptionIsRequired={descriptionIsRequired}
                value={commonFields}
                onChange={updateCommonFields}
                enabledPlatforms={enabledPlatforms}
                layout={layout}
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
      )}
    </div>
  );
}
