import React, { useCallback } from 'react';
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
import PrimaryChatSwitcher from './PrimaryChatSwitcher';
import { CaretDownOutlined } from '@ant-design/icons';
import LiveOutputEditingCard from './LiveOutputEditingCard';
import StreamShiftCard from './StreamShiftCard';
import styles from './GoLive.m.less';
import cx from 'classnames';

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
    isLiveOutputEditingEnabled,
    enabledPlatformsCount,
    isMidStreamMode,
    primaryChat,
    hasMultiplePlatforms,
    setPrimaryChat,
    showFeatureToggleCards,
  } = useGoLiveSettings().extend(settings => ({
    get descriptionIsRequired() {
      const fbSettings = settings.state.platforms['facebook'];
      return fbSettings && fbSettings.enabled && !fbSettings.useCustomFields;
    },

    get layout(): TInputLayout {
      return 'vertical';
    },
  }));

  const layoutMode = 'multiplatformAdvanced';

  const createPlatformBinding = useCallback(
    <T extends TPlatform>(platform: T): IPlatformComponentParams<T> => {
      return {
        isUpdateMode,
        layoutMode,
        isDualOutputMode,
        isStreamShiftMode,
        isAiHighlighterEnabled,
        isMidStreamMode,
        isLiveOutputEditingEnabled,
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
      isLiveOutputEditingEnabled,
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
      {showFeatureToggleCards && !isUpdateMode && (
        <>
          <h2>{$t('Live Settings')}</h2>
          <div className="flex__horizontal margin">
            <LiveOutputEditingCard />
            <StreamShiftCard />
          </div>
        </>
      )}

      <h2 className={cx({ [styles.sectionTitle]: showFeatureToggleCards && !isUpdateMode })}>
        {$t('Channel Settings')}
      </h2>

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
