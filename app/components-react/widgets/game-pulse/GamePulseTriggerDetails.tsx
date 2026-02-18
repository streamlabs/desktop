import React, { useMemo, useCallback, memo } from 'react';
import set from 'lodash/set';
import get from 'lodash/get';
import cloneDeep from 'lodash/cloneDeep';
import { Collapse } from 'antd';
import { $t } from 'services/i18n';
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
  GroupedListInput,
} from 'components-react/shared/inputs';
import { IListGroup } from 'components-react/shared/inputs/GroupedListInput';
import { LayoutInput } from 'components-react/widgets/common/LayoutInput';
import css from './GamePulseTriggerDetails.m.less';
import { AnimationGroup, GamePulseStaticConfig, GamePulseTrigger } from './GamePulse.types';

interface GamePulseTriggerDetailsProps {
  trigger: GamePulseTrigger;
  staticConfig?: GamePulseStaticConfig;
  onUpdate?: (updatedTrigger: GamePulseTrigger) => void;
}

/**
 * Trigger Details Form
 */
export const GamePulseTriggerDetails = memo(function GamePulseTriggerDetails({
  trigger,
  onUpdate,
  staticConfig,
}: GamePulseTriggerDetailsProps) {
  const { totalPeriodOptions, levelRangeOptions, voiceOptions, animationOptions } = useMemo(() => {
    const totalPeriods = staticConfig?.data?.options?.event_time_periods ?? {};
    const totalPeriodOptions = Object.entries(totalPeriods).map(([key, value]) => ({
      label: String(value),
      value: key,
    }));

    const levelRangeOptions = [
      { value: 'minimum', label: $t('Minimum') },
      { value: 'maximum', label: $t('Maximum') },
      { value: 'between', label: $t('Between') },
    ];

    const voices = staticConfig?.data?.options?.tts_voices || {};
    const mappedVoices: IListGroup<string>[] = Object.entries(voices).map(([key, group]: [string, any]) => ({
      label: key,
      options: group.list.map((item: { key: string; value: string }) => ({
        label: item.value,
        value: item.key,
      })),
    }));

    // sort voices to prioritize English ones at the top
    const voiceOptions = mappedVoices.sort((a, b) => {
      const aLabel = a.label;
      const bLabel = b.label;

      if (aLabel === 'English (US)') return -1;
      if (bLabel === 'English (US)') return 1;

      const aIsEnglish = aLabel.toLowerCase().includes('english');
      const bIsEnglish = bLabel.toLowerCase().includes('english');

      if (aIsEnglish && !bIsEnglish) return -1;
      if (!aIsEnglish && bIsEnglish) return 1;

      return aLabel.localeCompare(bLabel);
    });

    const anims = staticConfig?.data?.animations;
    const animationOptions = {
      showAnimationOptions: anims ? mapAnimationGroups(anims.show_animations) : [],
      hideAnimationOptions: anims ? mapAnimationGroups(anims.hide_animations) : [],
      textAnimationOptions: anims ? mapAnimationGroups(anims.text_animations) : [],
    };

    return {
      totalPeriodOptions,
      levelRangeOptions,
      voiceOptions,
      animationOptions,
    };
  }, [staticConfig]);

  const { showAnimationOptions, hideAnimationOptions, textAnimationOptions } = animationOptions;

  const handleFieldChange = useCallback(
    (path: string, value: any) => {
      if (!onUpdate) return;
      if (get(trigger, path) === value) return;
      const nextTrigger = cloneDeep(trigger);
      set(nextTrigger, path, value);
      onUpdate(nextTrigger);
    },
    [trigger, onUpdate],
  );

  const bind = (path: string, defaultValue?: any) => ({
    value: get(trigger, path) ?? defaultValue,
    onChange: (val: any) => handleFieldChange(path, val),
  });

  const currentLevelRangeType = getLevelRangeType(trigger);
  const showMin = currentLevelRangeType === 'minimum' || currentLevelRangeType === 'between';
  const showMax = currentLevelRangeType === 'maximum' || currentLevelRangeType === 'between';

  const handleLevelRangeChange = useCallback(
    (newType: 'minimum' | 'maximum' | 'between') => {
      if (!onUpdate) return;
      if (newType === getLevelRangeType(trigger)) return;
      const nextTrigger = cloneDeep(trigger);

      if (newType === 'minimum') {
        nextTrigger.amount_maximum = null;
      } else if (newType === 'maximum') {
        nextTrigger.amount_minimum = null;
        if (nextTrigger.amount_maximum == null) nextTrigger.amount_maximum = 10;
      } else if (newType === 'between') {
        if (nextTrigger.amount_minimum == null) nextTrigger.amount_minimum = 1;
        if (nextTrigger.amount_maximum == null) nextTrigger.amount_maximum = 10;
      }

      onUpdate(nextTrigger);
    },
    [trigger, onUpdate],
  );

  const messageTemplateTooltip = $t('When a trigger fires, this will be the format of the message. Available tokens: {number}');
  const isStreak = trigger.event_type === 'streak';
  const isTotal = trigger.event_type === 'total';
  const isLevel = trigger.event_type === 'level';

  return (
    <div>
      {/* Header */}
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

      {/* Font Settings */}
      <Collapse bordered={false} defaultActiveKey={['font-settings']}>
        <Collapse.Panel header={$t('Font Settings')} key="font-settings">
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

      {/* Animations */}
      <Collapse bordered={false} defaultActiveKey={['animation-settings']}>
        <Collapse.Panel header={$t('Animation Settings')} key="animation-settings">
          <div className={css.animationRow}>
            <span className={css.animationLabel}>{$t('Animation')}</span>
            <div className={css.selectInputGroup}>
              <GroupedListInput
                {...bind('media_settings.show_animation')}
                options={showAnimationOptions}
                showSearch
              />
              <GroupedListInput
                {...bind('media_settings.hide_animation')}
                options={hideAnimationOptions}
                showSearch
              />
            </div>
          </div>
          <GroupedListInput
            label={$t('Text Animation')}
            {...bind('text_settings.text_animation')}
            options={textAnimationOptions}
            showSearch
          />
          <SliderInput
            label={$t('Text Delay')}
            {...bind('text_settings.text_delay_ms', 0)}
            max={20000}
            tipFormatter={(ms: number) => `${(ms / 1000).toFixed(1)}s`}
          />
        </Collapse.Panel>
      </Collapse>

      {/* TTS */}
      <Collapse bordered={false} defaultActiveKey={['tts-settings']} className={css.collapseOverrides}>
        <Collapse.Panel
          header={$t('Text To Speech')}
          key="tts-settings"
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
});

function getLevelRangeType(trigger: GamePulseTrigger): 'minimum' | 'maximum' | 'between' {
  if (trigger.amount_minimum != null && trigger.amount_maximum != null) return 'between';
  if (trigger.amount_maximum != null) return 'maximum';
  return 'minimum';
}

// map backend animation groups to UI GroupedList options
function mapAnimationGroups(groups?: AnimationGroup | AnimationGroup[]): IListGroup<string>[] {
  if (!groups) return [];
  const arr = Array.isArray(groups) ? groups : [groups];

  return arr.map(g => ({
    label: g.group,
    options: (g.list || []).map(item => ({
      label: item.value,
      value: item.key,
    })),
  }));
}
