import { CommonPlatformFields } from '../CommonPlatformFields';
import React, { memo, useMemo } from 'react';
import { $t } from '../../../../services/i18n';
import { TwitchTagsInput } from './TwitchTagsInput';
import GameSelector from '../GameSelector';
import Form from '../../../shared/inputs/Form';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import { CheckboxInput, createBinding } from '../../../shared/inputs';
import { ITwitchStartStreamOptions } from '../../../../services/platforms/twitch';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';
import TwitchContentClassificationInput from './TwitchContentClassificationInput';
import AiHighlighterToggle from '../AiHighlighterToggle';
import Badge from 'components-react/shared/DismissableBadge';
import { EDismissable } from 'services/dismissables';
import { CustomFieldsCheckbox } from '../CustomFieldsCheckbox';
import Utils from 'services/utils';

export function TwitchEditStreamInfo(p: IPlatformComponentParams<'twitch'>) {
  const twSettings = p.value;

  function updateSettings(patch: Partial<ITwitchStartStreamOptions>) {
    p.onChange({ ...twSettings, ...patch });
  }

  return (
    <Form name="twitch-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="twitch-common"
            platform="twitch"
            layoutMode={p.layoutMode}
            value={twSettings}
            onChange={updateSettings}
            layout={p.layout}
          />
        }
        requiredFields={<TwitchRequiredFields key="twitch-required" {...p} />}
        optionalFields={<TwitchOptionalFields key="twitch-optional" {...p} />}
      />
    </Form>
  );
}

const TwitchRequiredFields = memo((p: IPlatformComponentParams<'twitch'>) => {
  const bind = createBinding(p.value, updatedSettings =>
    p.onChange({ ...p.value, ...updatedSettings }),
  );

  return (
    <>
      <div className="flex__horizontal margin">
        <GameSelector platform={'twitch'} {...bind.game} layout="vertical" />
        <TwitchTagsInput label={$t('Twitch Tags')} {...bind.tags} layout="vertical" />
      </div>
      {p.isAiHighlighterEnabled && (
        <AiHighlighterToggle key="ai-toggle" game={bind.game?.value} banner={true} />
      )}
    </>
  );
});

const TwitchOptionalFields = memo((p: IPlatformComponentParams<'twitch'>) => {
  const twSettings = p.value;
  function updateSettings(patch: Partial<ITwitchStartStreamOptions>) {
    p.onChange({ ...twSettings, ...patch });
  }

  const bind = createBinding(twSettings, updatedSettings => updateSettings(updatedSettings));

  const isDualStream = useMemo(() => {
    return twSettings?.display === 'both' && p.isDualOutputMode;
  }, [p.isDualOutputMode, twSettings?.display]);

  const multiplePlatformEnabled = useMemo(() => {
    if (!p.enabledPlatformsCount) return false;
    return p.enabledPlatformsCount > 1;
  }, [p.enabledPlatformsCount, isDualStream]);

  const enhancedBroadcastingTooltipText = useMemo(() => {
    return p.isDualOutputMode
      ? $t(
          'Enhanced broadcasting in dual output mode is only available when streaming to both the horizontal and vertical displays in Twitch',
        )
      : $t(
          'Enhanced broadcasting automatically optimizes your settings to encode and send multiple video qualities to Twitch. Selecting this option will send basic information about your computer and software setup.',
        );
  }, [p.isDualOutputMode]);

  const enhancedBroadcastingEnabled = useMemo(() => {
    if (isDualStream) return true;
    if (Utils.isPreview()) return true;
    if (multiplePlatformEnabled) return false;
    if (p.isStreamShiftMode) return false;
    return twSettings?.isEnhancedBroadcasting;
  }, [
    isDualStream,
    multiplePlatformEnabled,
    twSettings?.isEnhancedBroadcasting,
    p.isStreamShiftMode,
  ]);

  return (
    <>
      <TwitchContentClassificationInput {...bind.contentClassificationLabels} layout={p.layout} />
      <div className="flex__horizontal">
        <InputWrapper layout="vertical" nolabel>
          <CheckboxInput label={$t('Stream features branded content')} {...bind.isBrandedContent} />
        </InputWrapper>
        <CustomFieldsCheckbox {...p} platform="twitch" />
        {process.platform !== 'darwin' && (
          <InputWrapper layout="vertical" nolabel>
            <CheckboxInput
              style={{ display: 'inline-block' }}
              label={$t('Enhanced broadcasting')}
              tooltip={enhancedBroadcastingTooltipText}
              {...bind.isEnhancedBroadcasting}
              disabled={isDualStream || multiplePlatformEnabled || p.isStreamShiftMode}
              value={enhancedBroadcastingEnabled}
              tooltipIcon={
                <i
                  className="icon-information"
                  style={{ marginLeft: '4px', verticalAlign: 'middle' }}
                />
              }
            />
            <Badge
              style={{ display: 'inline-block', margin: '1px 0 0 0px' }}
              dismissableKey={EDismissable.EnhancedBroadcasting}
              content={'Beta'}
            />
          </InputWrapper>
        )}
      </div>
    </>
  );
});
