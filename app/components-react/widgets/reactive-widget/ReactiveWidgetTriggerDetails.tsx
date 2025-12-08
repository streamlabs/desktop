import React, { useMemo, useCallback } from 'react';
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

interface ReactiveWidgetTriggerDetailsProps {
  trigger: any;
  staticConfig?: any;
  onUpdate?: (updatedTrigger: any) => void;
}

function flattenAnimationOptions(options: any): any[] {
  if (!options) return [];
  const flattened: any[] = [];
  const optionsArray = Array.isArray(options) ? options : [options];
  optionsArray.forEach(opt => {
    if (!opt) return;
    if (opt.list && Array.isArray(opt.list)) {
      opt.list.forEach((subOpt: any) => {
        flattened.push({
          label: subOpt.value,
          value: subOpt.key,
        });
      });
    } else {
      flattened.push({
        label: opt.value,
        value: opt.key,
      });
    }
  });
  return flattened;
}

export function ReactiveWidgetTriggerDetails({
  trigger,
  onUpdate,
  staticConfig,
}: ReactiveWidgetTriggerDetailsProps) {
  const isStreakTrigger = trigger?.type === 'streak';

  const streakOptions = useMemo(
    () =>
      Object.entries(
        staticConfig?.data?.options?.streak_time_periods ?? {},
      ).map(([key, value]) => ({ label: String(value), value: key })),
    [staticConfig?.data?.options?.streak_time_periods],
  );

  const animationsConfig = (staticConfig?.data?.animations ?? {}) as {
    show_animations?: any;
    hide_animations?: any;
    text_animations?: any;
  };

  const showAnimationOptions = useMemo(
    () => flattenAnimationOptions(animationsConfig.show_animations),
    [animationsConfig.show_animations],
  );

  const hideAnimationOptions = useMemo(
    () => flattenAnimationOptions(animationsConfig.hide_animations),
    [animationsConfig.hide_animations],
  );

  const textAnimationOptions = useMemo(
    () => flattenAnimationOptions(animationsConfig.text_animations),
    [animationsConfig.text_animations],
  );

  const messageTemplateTooltip = $t(
    'When a trigger fires, this will be the format of the message. Available tokens: number',
  );

  const bind = useCallback(
    (path: string) => {
      const segments = path.split('.');

      let value: any = trigger;
      for (const seg of segments) {
        if (value == null) break;
        value = value[seg];
      }

      return {
        value,
        onChange: (nextVal: any) => {
          if (!onUpdate) return;
          const updated: any = { ...trigger };
          let cursor: any = updated;

          for (let i = 0; i < segments.length - 1; i++) {
            const key = segments[i];
            cursor[key] = { ...(cursor[key] || {}) };
            cursor = cursor[key];
          }

          cursor[segments[segments.length - 1]] = nextVal;
          onUpdate(updated);
        },
      };
    },
    [trigger, onUpdate],
  );

  return (
    <div>
      <div className={css.headerRow}>
        <h3 className={css.title}>{$t('Trigger Details')}</h3>
        <div className={trigger.enabled ? css.switchEnabled : css.switchDisabled}>
          <SwitchInput
            name={`toggle-${trigger.id}`}
            value={trigger.enabled}
            onChange={value => onUpdate && onUpdate({ ...trigger, enabled: value as boolean })}
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
        <Collapse.Panel header={$t('Font Settings')} key={1}>
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
        <Collapse.Panel header={$t('Animation Settings')} key={2}>
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
