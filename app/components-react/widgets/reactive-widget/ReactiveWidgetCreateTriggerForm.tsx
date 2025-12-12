import React, { useMemo, useState, useCallback } from 'react';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { Button } from 'antd';
import { $t } from 'services/i18n/i18n';
import { 
  ReactiveWidgetSettings, 
  ReactiveTrigger, 
  SelectOption 
} from './ReactiveWidget.helpers';
import css from './ReactiveWidgetCreateTriggerForm.m.less';

interface TriggerFormProps {
  trigger: { game?: string; event_type?: string; name?: string };
  onSubmit: (data: {
    eventType: string;
    game: string;
    name: string;
    triggerType: string;
  }) => void;
  availableGameEvents: Record<string, string[]>;
  gameEvents: Record<string, any>;
  globalEvents?: Record<string, string>;
  gameOptions?: SelectOption[];
  data: { settings: ReactiveWidgetSettings };
}

export function ReactiveWidgetCreateTriggerForm(props: TriggerFormProps) {
  const {
    trigger,
    data,
    onSubmit,
    availableGameEvents,
    gameEvents,
    globalEvents,
    gameOptions = [],
  } = props;

  const [values, setValues] = useState({
    game: trigger.game || gameOptions[0]?.value || '',
    event_type: trigger.event_type || '',
    name: trigger.name || '',
  });

  const eventOptions = useMemo(() => {
    const gameKey = values.game as string;
    if (!gameKey) return [];

    const existingTriggers = getTriggersForGame(data, gameKey);

    const eventKeys = gameKey === 'global'
      ? Object.keys(globalEvents || {})
      : availableGameEvents[gameKey] || [];

    return eventKeys
      .filter(eventKey => {
        // filter out 'achievement' events that are already taken
        const evtMeta = gameEvents?.[eventKey];
        if (evtMeta?.trigger_type === 'achievement') {
           return !existingTriggers.some(t => 
             t.type === 'achievement' && t.game_event === eventKey
           );
        }
        return true;
      })
      .map(eventKey => ({
        value: eventKey,
        label: gameKey === 'global'
            ? globalEvents?.[eventKey] || eventKey
            : gameEvents?.[eventKey]?.title || eventKey,
      }));
  }, [values.game, availableGameEvents, gameEvents, globalEvents, data]);

  const triggerType = useMemo(() => {
    if (!values.event_type) return '';
    return gameEvents[values.event_type]?.trigger_type || 'streak';
  }, [values.event_type, gameEvents]);

  const handleGameChange = useCallback((newGame: string) => {
    // reset event and name when game changes
    setValues({
      game: newGame,
      event_type: '',
      name: '',
    });
  }, []);

  const handleEventChange = useCallback((newEvent: string) => {
    const selectedOption = eventOptions.find(opt => opt.value === newEvent);
    const baseLabel = selectedOption?.label || newEvent;
    const uniqueName = generateUniqueName(data, values.game as string, baseLabel);

    setValues(prev => ({
      ...prev,
      event_type: newEvent,
      name: uniqueName
    }));
  }, [data, values.game, eventOptions]);

  const handleNameChange = useCallback((newName: string) => {
    setValues(prev => ({ ...prev, name: newName }));
  }, []);

  const handleChange = useCallback((key: string) => (value: TInputValue) => {
    if (key === 'game') handleGameChange(value as string);
    else if (key === 'event_type') handleEventChange(value as string);
    else if (key === 'name') handleNameChange(value as string);
  }, [handleGameChange, handleEventChange, handleNameChange]);

  const metadata = useMemo(() => ({
    game: {
      type: 'list',
      label: $t('Game'),
      placeholder: $t('Select a Game'),
      options: gameOptions,
    },
    event_type: {
      type: 'list',
      label: $t('Event Type'),
      placeholder: $t('Select an Event'),
      options: eventOptions,
    },
    name: {
      type: 'text',
      label: $t('Name'),
      placeholder: 'Trigger Name',
    },
  }), [gameOptions, eventOptions]);

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
        disabled={!isValid}
        type="primary"
        size="large"
        onClick={() =>
          onSubmit({
            eventType: values.event_type as string,
            game: values.game as string,
            name: values.name as string,
            triggerType,
          })
        }
      >
        {$t('Add')}
      </Button>
    </div>
  );
}

function getTriggersForGame(data: { settings: ReactiveWidgetSettings }, gameKey: string): ReactiveTrigger[] {
  const settings = data?.settings;
  if (!settings) return [];
  
  if (gameKey === 'global') {
    return settings.global?.triggers || [];
  }
  return settings.games?.[gameKey]?.triggers || [];
}

function generateUniqueName(
  data: { settings: ReactiveWidgetSettings }, 
  gameKey: string, 
  baseLabel: string
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