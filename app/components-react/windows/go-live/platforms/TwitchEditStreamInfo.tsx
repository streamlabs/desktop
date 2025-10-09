import { CommonPlatformFields } from '../CommonPlatformFields';
import React from 'react';
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
import { Services } from 'components-react/service-provider';

import Badge from 'components-react/shared/DismissableBadge';
import { EDismissable } from 'services/dismissables';

export function TwitchEditStreamInfo(p: IPlatformComponentParams<'twitch'>) {
  const twSettings = p.value;
  const aiHighlighterFeatureEnabled = Services.HighlighterService.aiHighlighterFeatureEnabled;
  function updateSettings(patch: Partial<ITwitchStartStreamOptions>) {
    p.onChange({ ...twSettings, ...patch });
  }

  const enhancedBroadcastingTooltipText = Services.DualOutputService.views.dualOutputMode
    ? $t(
        'Enhanced broadcasting in dual output mode is only available when streaming to both the horizontal and vertical displays',
      )
    : $t(
        'Enhanced broadcasting automatically optimizes your settings to encode and send multiple video qualities to Twitch. Selecting this option will send basic information about your computer and software setup.',
      );
  const bind = createBinding(twSettings, updatedSettings => updateSettings(updatedSettings));

  const showEnhancedBroadcasting =
    (p.enabledPlatformsCount === 1 && process.platform !== 'darwin') ||
    Services.DualOutputService.views.dualOutputMode;

  const optionalFields = (
    <div key="optional">
      <TwitchTagsInput label={$t('Twitch Tags')} {...bind.tags} />
      <TwitchContentClassificationInput {...bind.contentClassificationLabels} />
      <InputWrapper>
        <CheckboxInput label={$t('Stream features branded content')} {...bind.isBrandedContent} />
      </InputWrapper>
    </div>
  );
  return (
    <Form name="twitch-settings">
      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={
          <CommonPlatformFields
            key="common"
            platform="twitch"
            layoutMode={p.layoutMode}
            value={twSettings}
            onChange={updateSettings}
          />
        }
        requiredFields={
          <React.Fragment key="required-fields">
            <GameSelector key="required" platform={'twitch'} {...bind.game} />
            {aiHighlighterFeatureEnabled && (
              <AiHighlighterToggle key="ai-toggle" game={bind.game?.value} cardIsExpanded={true} />
            )}
          </React.Fragment>
        }
        optionalFields={optionalFields}
      />
      {showEnhancedBroadcasting && (
        <InputWrapper>
          <CheckboxInput
            style={{ display: 'inline-block' }}
            label={$t('Enhanced broadcasting')}
            tooltip={enhancedBroadcastingTooltipText}
            {...bind.isEnhancedBroadcasting}
            disabled={twSettings?.display === 'both'}
            value={twSettings?.display === 'both' ? true : twSettings?.isEnhancedBroadcasting}
          />
          <Badge
            style={{ display: 'inline-block' }}
            dismissableKey={EDismissable.EnhancedBroadcasting}
            content={'Beta'}
          />
        </InputWrapper>
      )}
    </Form>
  );
}
