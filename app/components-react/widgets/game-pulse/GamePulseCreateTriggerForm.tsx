import React, { useMemo, useState, useCallback } from 'react';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { Button } from 'antd';
import { $t } from 'services/i18n/i18n';
import {
  GamePulseWidgetSettings,
  GamePulseTrigger,
  SelectOption,
  GamePulseEventMeta,
} from './GamePulse.types';
import css from './GamePulseCreateTriggerForm.m.less';

interface TriggerFormProps {
  trigger: { game?: string; event_type?: string; name?: string };
  onSubmit: (data: { eventType: string; game: string; name: string; triggerType: string }) => Promise<void> | void;
  availableGameEvents: Record<string, string[]>;
  gameEvents: Record<string, GamePulseEventMeta>;
  globalEvents?: Record<string, string>;
  gameOptions?: SelectOption[];
  data: { settings: GamePulseWidgetSettings };
}

export function GamePulseCreateTriggerForm(props: TriggerFormProps) {
  const {
    trigger,
    data,
    onSubmit,
    availableGameEvents,
    gameEvents,
    globalEvents,
    gameOptions = [],
  } = props;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [values, setValues] = useState({
    game: trigger.game || gameOptions[0]?.value || '',
    event_type: trigger.event_type || '',
    name: trigger.name || '',
    trigger_type: '',
  });

  const eventOptions = useMemo(() => {
    const gameKey = values.game as string;
    if (!gameKey) return [];

    const existingTriggers = getTriggersForGame(data, gameKey);

    const eventKeys =
      gameKey === 'global' ? Object.keys(globalEvents || {}) : availableGameEvents[gameKey] || [];

    return eventKeys
      .filter(eventKey => {
        // filter out 'achievement' events that are already taken
        const evtMeta = gameEvents?.[eventKey];
        if (evtMeta?.trigger_types.includes('achievement')) {
          return !existingTriggers.some(
            t => t.event_type === 'achievement' && t.game_event === eventKey,
          );
        }
        return true;
      })
      .map(eventKey => ({
        value: eventKey,
        label:
          gameKey === 'global'
            ? globalEvents?.[eventKey] || eventKey
            : gameEvents?.[eventKey]?.title || eventKey,
      }));
  }, [values.game, availableGameEvents, gameEvents, globalEvents, data]);

  const triggerTypeOptions = useMemo(() => {
    const eventType = values.event_type;
    if (!eventType) return [];

    const evtMeta = gameEvents?.[eventType];
    if (!evtMeta) return [];

    return evtMeta.trigger_types.map(triggerType => ({
      label: triggerType.charAt(0).toUpperCase() + triggerType.slice(1),
      value: triggerType,
    }));
  }, [values.event_type, gameEvents]);

  const handleGameChange = useCallback((newGame: string) => {
    // reset event and name when game changes
    setValues({
      game: newGame,
      event_type: '',
      name: '',
      trigger_type: '',
    });
  }, []);

  const handleEventChange = useCallback(
    (newEvent: string) => {
      const selectedOption = eventOptions.find(opt => opt.value === newEvent);
      const baseLabel = selectedOption?.label || newEvent;
      const uniqueName = generateUniqueName(data, values.game as string, baseLabel);
      const types = gameEvents[newEvent]?.trigger_types || [];
      const defaultTriggerType = types.length > 0 ? types[0] : '';

      setValues(prev => ({
        ...prev,
        name: uniqueName,
        event_type: newEvent,
        trigger_type: defaultTriggerType,
      }));
    },
    [data, values.game, eventOptions, gameEvents],
  );

  const handleNameChange = useCallback((newName: string) => {
    setValues(prev => ({ ...prev, name: newName }));
  }, []);

  const handleChange = useCallback(
    (key: string) => (value: TInputValue) => {
      if (key === 'game') handleGameChange(value as string);
      else if (key === 'event_type') handleEventChange(value as string);
      else if (key === 'name') handleNameChange(value as string);
      else if (key === 'trigger_type') {
        setValues(prev => ({ ...prev, trigger_type: value as string }));
      }
    },
    [handleGameChange, handleEventChange, handleNameChange],
  );

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      await onSubmit({
        eventType: values.event_type as string,
        game: values.game as string,
        name: values.name as string,
        triggerType: values.trigger_type as string,
      });

    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  const metadata = useMemo(() => {
    return {
      game: {
        type: 'list',
        label: $t('Game'),
        placeholder: $t('Select a Game'),
        options: gameOptions,
        showSearch: true,
      },
      event_type: {
        type: 'list',
        label: $t('Event Type'),
        placeholder: $t('Select an Event'),
        options: eventOptions,
        showSearch: true,
      },
      ...(triggerTypeOptions.length > 1 && {
        trigger_type: {
          type: 'list',
          label: $t('Trigger Type'),
          description: values.trigger_type === 'streak' ? $t('Triggered when a player achieves a consecutive number of events without interruption.') : $t('Triggered when a player reaches a cumulative total number of events.'),
          options: triggerTypeOptions,
        },
      }),
      name: {
        type: 'text',
        label: $t('Trigger Name'),
        placeholder: $t('Trigger Name'),
      },
    };
  }, [gameOptions, eventOptions, triggerTypeOptions, values.trigger_type]);

  const isValid = values.game && values.event_type && values.name;

  return (
    <div className={css.container}>
      <FormFactory
        metadata={metadata}
        values={values}
        onChange={handleChange}
        name="create-trigger-form"
      />
      <Button
        className={css.submitBtn}
        disabled={!isValid || isSubmitting}
        loading={isSubmitting}
        type="primary"
        size="large"
        onClick={handleSubmit}
      >
        {$t('Add')}
      </Button>
    </div>
  );
}

function getTriggersForGame(
  data: { settings: GamePulseWidgetSettings },
  gameKey: string,
): GamePulseTrigger[] {
  const settings = data?.settings;
  if (!settings) return [];

  if (gameKey === 'global') {
    return settings.global?.triggers || [];
  }
  return settings.games?.[gameKey]?.triggers || [];
}

function generateUniqueName(
  data: { settings: GamePulseWidgetSettings },
  gameKey: string,
  baseLabel: string,
): string {
  const triggers = getTriggersForGame(data, gameKey);
  const existingNames = triggers.map(t => t.name).filter(Boolean);

  // regex to match "Name" or "Name (1)"
  const escapedLabel = baseLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedLabel}(?: \\((\\d+)\\))?$`);

  let maxNumber = -1;
  let hasMatch = false;

  existingNames.forEach(name => {
    const match = name.match(regex);
    if (match) {
      hasMatch = true;
      const num = match[1] ? parseInt(match[1], 10) : 0;
      if (num > maxNumber) maxNumber = num;
    }
  });

  if (!hasMatch) return baseLabel;

  // Return Base (Max + 1)
  return `${baseLabel} (${maxNumber + 1})`;
}
