import { CommonPlatformFields } from '../CommonPlatformFields';
import React, { useMemo } from 'react';
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

export function TwitchEditStreamInfo(p: IPlatformComponentParams<'twitch'>) {
  const twSettings = p.value;

  function updateSettings(patch: Partial<ITwitchStartStreamOptions>) {
    p.onChange({ ...twSettings, ...patch });
  }

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
        requiredFields={<TwitchRequiredFields {...p} key="required" />}
        optionalFields={optionalFields}
      />
    </Form>
  );
}

function TwitchRequiredFields(p: IPlatformComponentParams<'twitch'>) {
  const { isUpdateMode } = p;
  const twSettings = p.value;
  const bind = createBinding(twSettings, updatedSettings =>
    p.onChange({ ...twSettings, ...updatedSettings }),
  );

  const isDualStream = useMemo(() => {
    return twSettings?.display === 'both' && p.isDualOutputMode;
  }, [p.isDualOutputMode, twSettings?.display]);

  // Note: once a stream goes live with enhanced broadcasting, it cannot be toggled off while live
  const enhancedBroadcastingEnabled = useMemo(() => {
    if (isDualStream) return true;
    if (p.isStreamShiftMode) return false;
    return twSettings?.isEnhancedBroadcasting;
  }, [isDualStream, twSettings?.isEnhancedBroadcasting, p.isStreamShiftMode]);

  return (
    <>
      <GameSelector key="twitch-game" platform={'twitch'} {...bind.game} layout={p.layout} />
      {p.isAiHighlighterEnabled && (
        <AiHighlighterToggle key="ai-toggle" game={bind.game?.value} cardIsExpanded={false} />
      )}
      {process.platform !== 'darwin' && !isUpdateMode && (
        <InputWrapper
          layout={p.layout}
          className={cx({ [styles.hideLabel]: p.layout === 'vertical' })}
        >
          <CheckboxInput
            style={{ display: 'inline-block' }}
            label={$t('Enhanced broadcasting')}
            tooltip={$t(
              'Enhanced broadcasting automatically optimizes your settings to encode and send multiple video qualities to Twitch. Selecting this option will send basic information about your computer and software setup.',
            )}
            {...bind.isEnhancedBroadcasting}
            disabled={isDualStream || p.isStreamShiftMode}
            value={enhancedBroadcastingEnabled}
          />
          <Badge
            style={{ display: 'inline-block' }}
            dismissableKey={EDismissable.EnhancedBroadcasting}
            content={'Beta'}
          />
        </InputWrapper>
      )}
    </>
  );
}
