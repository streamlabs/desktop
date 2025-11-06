import { CommonPlatformFields } from '../CommonPlatformFields';
import React, { useEffect, useMemo } from 'react';
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
import styles from './TwitchEditStreamInfo.m.less';
import cx from 'classnames';
import Tooltip from 'components-react/shared/Tooltip';

export function TwitchEditStreamInfo(p: IPlatformComponentParams<'twitch'>) {
  const twSettings = p.value;
  // We always pass this into TwitchEditStreamInfo
  const enabledPlatformsCount = p.enabledPlatformsCount!;

  useEffect(() => {
    if (enabledPlatformsCount > 1 && twSettings.isEnhancedBroadcasting) {
      updateSettings({ isEnhancedBroadcasting: false });
    }
  }, [enabledPlatformsCount]);

  function updateSettings(patch: Partial<ITwitchStartStreamOptions>) {
    p.onChange({ ...twSettings, ...patch });
  }

  const enhancedBroadcastingTooltipText = p.isDualOutputMode
    ? $t(
        'Enhanced broadcasting in dual output mode is only available when streaming to both the horizontal and vertical displays in Twitch',
      )
    : $t(
        'Enhanced broadcasting automatically optimizes your settings to encode and send multiple video qualities to Twitch. Selecting this option will send basic information about your computer and software setup.',
      );
  const bind = createBinding(twSettings, updatedSettings => updateSettings(updatedSettings));

  const optionalFields = (
    <div key="optional">
      <TwitchTagsInput label={$t('Twitch Tags')} {...bind.tags} layout={p.layout} />
      <TwitchContentClassificationInput {...bind.contentClassificationLabels} layout={p.layout} />
      <InputWrapper
        layout={p.layout}
        className={cx(styles.twitchCheckbox, { [styles.hideLabel]: p.layout === 'vertical' })}
      >
        <CheckboxInput label={$t('Stream features branded content')} {...bind.isBrandedContent} />
      </InputWrapper>
      {process.platform !== 'darwin' && (
        <Tooltip
          title={$t('Enhanced broadcasting is required for Twitch Dual streaming')}
          placement="top"
          disabled={!p.isDualOutputMode || (p.isDualOutputMode && twSettings?.display !== 'both')}
          lightShadow
        >
          <InputWrapper
            layout={p.layout}
            className={cx(styles.twitchCheckbox, { [styles.hideLabel]: p.layout === 'vertical' })}
          >
            <CheckboxInput
              style={{ display: 'inline-block' }}
              label={$t('Enhanced broadcasting')}
              tooltip={enhancedBroadcastingTooltipText}
              {...bind.isEnhancedBroadcasting}
              disabled={twSettings?.display === 'both' || enabledPlatformsCount > 1}
              value={twSettings?.display === 'both' ? true : twSettings?.isEnhancedBroadcasting}
            />
            <Badge
              style={{ display: 'inline-block' }}
              dismissableKey={EDismissable.EnhancedBroadcasting}
              content={'Beta'}
            />
          </InputWrapper>
        </Tooltip>
      )}
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
            layout={p.layout}
          />
        }
        requiredFields={
          <React.Fragment key="required-fields">
            <GameSelector key="required" platform={'twitch'} {...bind.game} layout={p.layout} />
            {p.isAiHighlighterEnabled && (
              <AiHighlighterToggle key="ai-toggle" game={bind.game?.value} cardIsExpanded={false} />
            )}
          </React.Fragment>
        }
        optionalFields={optionalFields}
      />
    </Form>
  );
}
