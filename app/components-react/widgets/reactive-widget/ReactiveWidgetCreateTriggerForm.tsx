import React, { useEffect, useMemo, useState } from 'react';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { Button } from 'antd';
import { $t } from 'services/i18n/i18n';
import css from './ReactiveWidgetCreateTriggerForm.m.less'

interface TriggerFormProps {
  trigger: { game?: string; event_type?: string; name?: string };
  onSubmit: ({
    eventType,
    game,
    name,
    triggerType,
  }: {
    eventType: string;
    game: string;
    name: string;
    triggerType: string;
  }) => void;
  availableGameEvents: Record<string, any>;
  gameEvents: Record<string, any>;
  globalEvents?: Record<string, any>;
  gameOptions?: { label: string; value: string }[];
  data: any;
}

export function ReactiveWidgetCreateTriggerForm(props: TriggerFormProps) {
  const {
    trigger,
    data,
    onSubmit,
    availableGameEvents,
    gameEvents,
    globalEvents,
    gameOptions,
  } = props;

  const triggerDefaults = trigger ?? {
    game: gameOptions?.[0]?.value || '',
    event_type: '',
    name: '',
  };

  const [values, setValues] = useState<Record<string, TInputValue>>({
    game: triggerDefaults.game ?? '',
    event_type: triggerDefaults.event_type ?? '',
    name: triggerDefaults.name ?? '',
  });

  const triggerType = useMemo(() => {
    if (!values.event_type) return '';
    return gameEvents[values.event_type as string]?.trigger_type || '';
  }, [values.event_type, gameEvents]);

  const getTriggersForGame = (gameKey: string) => {
    const settings = data?.settings || {};
    if (gameKey === 'global') {
      return settings.global?.triggers ?? [];
    }
    return settings.games?.[gameKey]?.triggers ?? [];
  };

  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const makeUniqueName = (baseLabel: string, gameKey: string) => {
    const triggersForGame = getTriggersForGame(gameKey) || [];
    const existingNames = (triggersForGame as any[]).map(t => t.name).filter(Boolean) as string[];

    const regex = new RegExp(`^${escapeRegExp(baseLabel)}(?: \\((\\d+)\\))?$`);

    const count = existingNames.filter(name => regex.test(name)).length;

    if (count === 0) return baseLabel;
    return `${baseLabel} (${count})`;
  };

  const eventOptions = useMemo(() => {
    const gameKey = values.game as string;

    const triggersForGame = getTriggersForGame(gameKey);

    const hasAchievementTriggerForEvent = (eventKey: string) =>
      (triggersForGame as any[]).some(
        (t: any) => t.type === 'achievement' && t.game_event === eventKey,
      );

    const eventKeys: string[] =
      gameKey === 'global'
        ? Object.keys(globalEvents || {})
        : (availableGameEvents?.[gameKey] as string[]) || [];

    return eventKeys
      .filter(eventKey => {
        const evtMeta = gameEvents?.[eventKey];
        const evtTriggerType = evtMeta?.trigger_type;

        if (evtTriggerType === 'achievement' && hasAchievementTriggerForEvent(eventKey)) {
          return false;
        }

        return true;
      })
      .map(eventKey => ({
        label:
          gameKey === 'global'
            ? globalEvents?.[eventKey] || eventKey
            : gameEvents?.[eventKey]?.title || eventKey,
        value: eventKey,
      }));
  }, [values.game, availableGameEvents, gameEvents, globalEvents, data?.settings]);

  useEffect(() => {
    if (!values.game && gameOptions?.length) {
      setValues(prev => ({
        ...prev,
        game: (prev.game as string) || gameOptions[0].value,
      }));
    }
  }, [values.game, gameOptions]);

  useEffect(() => {
    setValues(prev => ({
      ...prev,
      event_type: '',
      name: '',
    }));
  }, [values.game]);

  useEffect(() => {
    if (!values.game) return;
    if (values.event_type) return;
    if (!eventOptions.length) return;

    const first = eventOptions[0];

    setValues(prev => {
      const gameKey = (prev.game || values.game) as string;
      const uniqueName = makeUniqueName(first.label as string, gameKey);

      return {
        ...prev,
        event_type: first.value,
        name: uniqueName,
      };
    });
  }, [values.game, values.event_type, eventOptions, data?.settings]);

  useEffect(() => {
    if (!values.event_type) return;

    const option = eventOptions.find(opt => opt.value === values.event_type);
    if (!option) return;

    setValues(prev => {
      const baseLabel = option.label as string;
      const gameKey = (prev.game || values.game) as string;
      const uniqueName = makeUniqueName(baseLabel, gameKey);

      return {
        ...prev,
        name: uniqueName,
      };
    });
  }, [values.event_type, values.game, eventOptions, data?.settings]);

  const metadata = {
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
      placeholder: triggerDefaults.name,
    },
  };

  const handleChange = (key: string) => (value: TInputValue) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

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
        disabled={!(values.game && values.event_type && values.name)}
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
