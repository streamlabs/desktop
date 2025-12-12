import React, { useMemo, useCallback } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import set from 'lodash/set';
import get from 'lodash/get';

import {
  MediaUrlInput,
  NumberInput,
  SliderInput,
  TextInput,
  AudioUrlInput,
  SwitchInput,
  FontFamilyInput,
  ColorInput,
  FontWeightInput,
  ListInput,
} from 'components-react/shared/inputs';
import { Collapse } from 'antd';
import { $t } from 'services/i18n';
import { LayoutInput } from '../common/LayoutInput';
import css from './ReactiveWidgetTriggerDetails.m.less';
import { ReactiveTrigger, flattenAnimationOptions } from './ReactiveWidget.helpers';

interface ReactiveWidgetTriggerDetailsProps {
  trigger: ReactiveTrigger;
  staticConfig?: any;
  onUpdate?: (updatedTrigger: ReactiveTrigger) => void;
}

/**
 * Custom hook to handle deep object binding.
 * Creates a { value, onChange } object for a given path (e.g., 'media_settings.sound_volume').
 */
function useTriggerBinding(
  trigger: ReactiveTrigger,
  onUpdate: ((t: ReactiveTrigger) => void) | undefined
) {
  return useCallback(
    (path: string, defaultValue?: any) => ({
      value: get(trigger, path) ?? defaultValue ?? '',
      onChange: (nextVal: any) => {
        if (!onUpdate) return;
        const updated = cloneDeep(trigger);
        set(updated, path, nextVal);
        onUpdate(updated);
      },
    }),
    [trigger, onUpdate]
  );
}

export function ReactiveWidgetTriggerDetails({
  trigger,
  onUpdate,
  staticConfig,
}: ReactiveWidgetTriggerDetailsProps) {

  const bind = useTriggerBinding(trigger, onUpdate);
  const isStreakTrigger = trigger?.type === 'streak';
  const streakOptions = useMemo(() => {
    const periods = staticConfig?.data?.options?.streak_time_periods ?? {};
    return Object.entries(periods).map(([key, value]) => ({
      label: String(value),
      value: key,
    }));
  }, [staticConfig]);

  const { showAnimationOptions, hideAnimationOptions, textAnimationOptions } = useMemo(() => {
    const anims = staticConfig?.data?.animations ?? {};
    return {
      showAnimationOptions: flattenAnimationOptions(anims.show_animations),
      hideAnimationOptions: flattenAnimationOptions(anims.hide_animations),
      textAnimationOptions: flattenAnimationOptions(anims.text_animations),
    };
  }, [staticConfig]);

  const messageTemplateTooltip = $t(
    'When a trigger fires, this will be the format of the message. Available tokens: number',
  );

  return (
    <div>
      <div className={css.headerRow}>
        <h3 className={css.title}>{$t('Trigger Details')}</h3>
        <div className={trigger.enabled ? css.switchEnabled : css.switchDisabled}>
          <SwitchInput
            name={`toggle-${trigger.id}`}
            {...bind('enabled')}
            label={trigger.enabled ? $t('Enabled') : $t('Disabled')}
            labelAlign="left"
            layout="horizontal"
            uncontrolled
            checkmark
          />
        </div>
      </div>

      <TextInput label={$t('Name')} {...bind('name')} />

      {isStreakTrigger && (
        <>
          <NumberInput label={$t('Amount Minimum')} {...bind('amount_minimum')} />
          <ListInput
            label={$t('Streak Time Period')}
            {...bind('streak_period')}
            options={streakOptions}
          />
        </>
      )}

      <h3 className={css.sectionTitle}>{$t('Action Settings')}</h3>

      <MediaUrlInput label={$t('Media')} {...bind('media_settings.image_href')} />
      <LayoutInput label={$t('Layout')} {...bind('layout')} />
      <AudioUrlInput label={$t('Sound')} {...bind('media_settings.sound_href')} />
      <SliderInput
        label={$t('Sound Volume')}
        debounce={500}
        {...bind('media_settings.sound_volume')}
        tipFormatter={(n: number) => `${n}%`}
      />
      <TextInput
        label={$t('Message Template')}
        tooltip={messageTemplateTooltip}
        {...bind('text_settings.message_template')}
      />
      <SliderInput
        label={$t('Duration')}
        min={2000}
        max={30000}
        step={1}
        debounce={500}
        {...bind('alert_duration_ms')}
        tipFormatter={(ms: number) => `${(ms / 1000).toFixed(1)}s`}
      />

      <Collapse bordered={false}>
        <Collapse.Panel header={$t('Font Settings')} key='font-settings'>
          <FontFamilyInput label={$t('Font Family')} {...bind('text_settings.font')} />
          <SliderInput
            min={8}
            max={80}
            label={$t('Font Size')}
            {...bind('text_settings.font_size')}
            tipFormatter={(n: number) => `${n}px`}
          />
          <FontWeightInput label={$t('Font Weight')} {...bind('text_settings.font_weight')} />
          <ColorInput label={$t('Text Color')} {...bind('text_settings.font_color')} />
          <ColorInput label={$t('Text Highlight Color')} {...bind('text_settings.font_color2')} />
        </Collapse.Panel>
      </Collapse>

      <Collapse bordered={false}>
        <Collapse.Panel header={$t('Animation Settings')} key='animation-settings'>
          <div className={css.animationRow}>
            <span className={css.animationLabel}>{$t('Animation')}</span>
            <div className={css.selectInputGroup}>
              <ListInput
                {...bind('media_settings.show_animation')}
                options={showAnimationOptions}
              />
              <ListInput
                {...bind('media_settings.hide_animation')}
                options={hideAnimationOptions}
              />
            </div>
          </div>

          <ListInput
            label={$t('Text Animation')}
            {...bind('text_settings.text_animation')}
            options={textAnimationOptions}
          />
          <SliderInput
            label={$t('Text Delay')}
            max={60000}
            {...bind('text_settings.text_delay_ms')}
            tipFormatter={(ms: number) => `${(ms / 1000).toFixed(1)}s`}
          />
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
