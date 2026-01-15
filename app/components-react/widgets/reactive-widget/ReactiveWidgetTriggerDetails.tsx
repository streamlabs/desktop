import React, { useMemo, useCallback, useRef } from 'react';
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
  GroupedListInput
} from 'components-react/shared/inputs';
import { Collapse } from 'antd';
import { $t } from 'services/i18n';
import { LayoutInput } from '../common/LayoutInput';
import css from './ReactiveWidgetTriggerDetails.m.less';
import { AnimationOptionConfig, ReactiveStaticConfig, ReactiveTrigger, SelectOption } from './ReactiveWidget.types';
import { IListGroup } from 'components-react/shared/inputs/GroupedListInput';

interface ReactiveWidgetTriggerDetailsProps {
  trigger: ReactiveTrigger;
  staticConfig?: ReactiveStaticConfig;
  onUpdate?: (updatedTrigger: ReactiveTrigger) => void;
}
type LevelRangeType = 'minimum' | 'maximum' | 'between';

enum TriggerPanelKeys {
  FontSettings = 'font-settings',
  AnimationSettings = 'animation-settings',
  TTSSettings = 'tts-settings',
}
/**
 * hook to handle deep object binding.
 */
function useTriggerBinding(
  trigger: ReactiveTrigger,
  onUpdate: ((t: ReactiveTrigger) => void) | undefined,
) {
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;

  return useCallback(
    (path: string, defaultValue?: any) => ({
      value: get(triggerRef.current, path) ?? defaultValue,
      onChange: (nextVal: any) => {
        if (!onUpdate) return;
        const updated = structuredClone(triggerRef.current);
        set(updated, path, nextVal);
        onUpdate(updated);
      },
    }),
    [onUpdate],
  );
}


function flattenAnimationOptions(
  options: AnimationOptionConfig | AnimationOptionConfig[] | undefined | null
): SelectOption[] {
  if (!options) return [];
  const arr = Array.isArray(options) ? options : [options];

  return arr.flatMap((opt) => {
    if (!opt) return [];
    if (opt.list && Array.isArray(opt.list)) {
      return opt.list.map((sub) => ({ label: sub.value, value: sub.key }));
    }
    return [{ label: opt.value, value: opt.key }];
  });
}

export function ReactiveWidgetTriggerDetails({
  trigger,
  onUpdate,
  staticConfig,
}: ReactiveWidgetTriggerDetailsProps) {
  const bind = useTriggerBinding(trigger, onUpdate);

  const { totalPeriodOptions, levelRangeOptions } = useMemo(() => {
    const totalPeriods = staticConfig?.data?.options?.event_time_periods ?? {};

    return {
      totalPeriodOptions: Object.entries(totalPeriods).map(([key, value]) => ({
        label: String(value),
        value: key,
      })),
      levelRangeOptions: [
        { value: 'minimum', label: $t('Minimum') },
        { value: 'maximum', label: $t('Maximum') },
        { value: 'between', label: $t('Between') },
      ],
    };
  }, [staticConfig]);

  const { showAnimationOptions, hideAnimationOptions, textAnimationOptions } = useMemo(() => {
    const anims = staticConfig?.data?.animations;
    if (!anims) {
      return {
        showAnimationOptions: [],
        hideAnimationOptions: [],
        textAnimationOptions: [],
      };
    }

    return {
      showAnimationOptions: flattenAnimationOptions(anims.show_animations?.list),
      hideAnimationOptions: flattenAnimationOptions(anims.hide_animations?.list),
      textAnimationOptions: flattenAnimationOptions(anims.text_animations?.list),
    };
  }, [staticConfig]);

  const voiceOptions = useMemo<IListGroup<string>[]>(() => {
    const rawVoices = staticConfig?.data?.options?.tts_voices || {};

    return Object.values(rawVoices).map((group: any) => ({
      label: group.group,
      options: group.list.map((item: any) => ({
        label: item.value,
        value: item.key,
      })),
    }));
  }, [staticConfig]);

  const eventType = trigger?.event_type;
  const isStreak = eventType === 'streak';
  const isTotal = eventType === 'total';
  const isLevel = eventType === 'level';

  function hasValue(n: any) {
    return n !== null && n !== undefined;
  }

  function deriveLevelRangeType(trigger: ReactiveTrigger): LevelRangeType {
    const hasMin = hasValue(trigger.amount_minimum);
    const hasMax = hasValue(trigger.amount_maximum);

    if (hasMin && hasMax) return 'between';
    if (hasMax) return 'maximum';
    return 'minimum';
  }

  function applyLevelRangeType(trigger: ReactiveTrigger, nextType: LevelRangeType) {
    switch (nextType) {
      case 'minimum': {
        trigger.amount_maximum = null;
        return;
      }
      case 'maximum': {
        trigger.amount_minimum = null;
        if (!hasValue(trigger.amount_maximum)) trigger.amount_maximum = 10;
        return;
      }
      case 'between': {
        if (!hasValue(trigger.amount_minimum)) trigger.amount_minimum = 1;
        if (!hasValue(trigger.amount_maximum)) trigger.amount_maximum = 10;
        return;
      }
    }
  }

  const currentLevelRangeType = useMemo<LevelRangeType | null>(() => {
    if (!isLevel) return null;
    return deriveLevelRangeType(trigger);
  }, [isLevel, trigger.amount_minimum, trigger.amount_maximum]);

  const handleLevelRangeChange = useCallback(
    (newType: LevelRangeType) => {
      if (!onUpdate) return;
      const updated = structuredClone(trigger);
      applyLevelRangeType(updated, newType);
      onUpdate(updated);
    },
    [trigger, onUpdate],
  );
  const showMin = currentLevelRangeType === 'minimum' || currentLevelRangeType === 'between';
  const showMax = currentLevelRangeType === 'maximum' || currentLevelRangeType === 'between';
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
            checkmark
          />
        </div>
      </div>

      <TextInput label={$t('Name')} {...bind('name')} />

      {(isStreak || isTotal) && (
        <NumberInput
          label={isStreak ? $t('Amount Minimum') : $t('Total Amount')}
          {...bind('amount_minimum')}
          min={0}
        />
      )}

      {isTotal && (
        <ListInput
          label={$t('Event Time Period')}
          {...bind('event_period')}
          options={totalPeriodOptions}
        />
      )}

      {isLevel && (
        <>
          <ListInput
            label={$t('Level Range Type')}
            value={currentLevelRangeType}
            onChange={handleLevelRangeChange}
            options={levelRangeOptions}
          />

          {showMin && (
            <NumberInput
              label={$t('Amount Minimum')}
              {...bind('amount_minimum')}
              min={0}
              max={trigger.amount_maximum ?? undefined}
            />
          )}

          {showMax && (
            <NumberInput label={$t('Amount Maximum')} {...bind('amount_maximum')} min={0} />
          )}
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
        max={60000}
        step={1}
        debounce={500}
        {...bind('alert_duration_ms')}
        tipFormatter={(ms: number) => `${(ms / 1000).toFixed(1)}s`}
      />

      <Collapse bordered={false} defaultActiveKey={[TriggerPanelKeys.FontSettings]}>
        <Collapse.Panel header={$t('Font Settings')} key={TriggerPanelKeys.FontSettings}>
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

      <Collapse bordered={false} defaultActiveKey={[TriggerPanelKeys.AnimationSettings]}>
        <Collapse.Panel header={$t('Animation Settings')} key={TriggerPanelKeys.AnimationSettings}>
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
            {...bind('text_settings.text_delay_ms')}
            max={20000}
            tipFormatter={(ms: number) => `${(ms / 1000).toFixed(1)}s`}
          />
        </Collapse.Panel>
      </Collapse>

      <Collapse bordered={false} defaultActiveKey={[TriggerPanelKeys.TTSSettings]}>
        <Collapse.Panel
          header={$t('Text To Speech')}
          key={TriggerPanelKeys.TTSSettings}
          extra={
            <div onClick={e => e.stopPropagation()}>
              <SwitchInput
                name={`tts-enabled-${trigger.id}`}
                {...bind('tts_settings.enabled')}
                label={trigger.tts_settings.enabled ? $t('Enabled') : $t('Disabled')}
                labelAlign="left"
                layout="horizontal"
                checkmark
              />
            </div>
          }
        >
          <GroupedListInput
            label={$t('Voice')}
            {...bind('tts_settings.language')}
            options={voiceOptions}
            showSearch
            placeholder={$t('Select a voice...')}
          />

          <SliderInput
            label={$t('Volume')}
            debounce={500}
            {...bind('tts_settings.volume')}
            tipFormatter={(n: number) => `${n}%`}
          />
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}