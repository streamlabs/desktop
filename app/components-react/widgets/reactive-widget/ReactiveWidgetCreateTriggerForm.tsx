import React, { useEffect, useMemo, useState } from 'react';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { Button } from 'antd';

interface TriggerFormProps {
  trigger: { game?: string; event_type?: string; name?: string };
  onSubmit: ({ eventType, game, name, triggerType }: { eventType: string; game: string; name: string; triggerType: string }) => void;
  availableGameEvents: Record<string, any>;
  gameEvents: Record<string, any>;
  globalEvents?: Record<string, any>;
  gameOptions?: { label: string; value: string }[];
  data: any;
}

export function ReactiveWidgetCreateTriggerForm(props: TriggerFormProps) {
  const { trigger, onSubmit, availableGameEvents, gameEvents, globalEvents, gameOptions } = props;
  const triggerDefaults = trigger ?? {
    game: gameOptions?.[0]?.value || '',
    event_type: '',
    name: '',
  };

  const [values, setValues] = useState<Record<string, TInputValue>>({
    game: triggerDefaults.game ?? '',
    event_type: triggerDefaults.event_type ?? '',
    name: triggerDefaults.name ?? '',
    triggerType: gameEvents && triggerDefaults.event_type ? gameEvents[triggerDefaults.event_type]?.trigger_type : '',
  });

  const triggerType = useMemo(() => {
    if (!values.event_type) return '';
    return gameEvents[values.event_type as string]?.trigger_type || '';
  }, [values.event_type, values.game, gameEvents, globalEvents]);
  
  const eventOptions = useMemo(() => {
    if (values.game === 'global') {
      return Object.entries(globalEvents || {}).map(([key, value]) => ({
        label: value,
        value: key,
      }));
    }

    return (
      availableGameEvents?.[values.game as string]?.map((eventType: string) => ({
        label:
          (values.game === 'global'
            ? globalEvents?.[eventType]
            : gameEvents?.[eventType]?.title) || eventType,
        value: eventType,
      })) || []
    );
  }, [values.game, availableGameEvents, gameEvents, globalEvents]);
  
  useEffect(() => {
    // reset event_type when game changes
    setValues(prev => ({
      ...prev,
      event_type: '',
      name: '',
    }));
  }, [values.game]);

  useEffect(() => {
    if (!values.event_type) return;

    const option = eventOptions.find((opt: any) => opt.value === values.event_type);
    if (!option) return;

    setValues(prev =>
      prev.name === option.label ? prev : { ...prev, name: option.label },
    );
  }, [values.event_type, eventOptions]);

  // TODO$chris: finish update to form metadata
  const metadata = {
    game: {
      type: 'list',
      label: 'Game',
      placeholder: 'Select a Game',
      options: gameOptions,
    },
    event_type: {
      type: 'list',
      label: 'Event Type',
      placeholder: 'Select an Event',
      options: eventOptions,
    },
    name: {
      type: 'text',
      label: 'Name',
      placeholder: triggerDefaults.name,
    },
  };

  const handleChange = (key: string) => (value: TInputValue) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', }}>
      <FormFactory
        metadata={metadata}
        values={values}
        onChange={handleChange}
        name="create-trigger-form"
      />
      <Button style={{ alignSelf: 'center' }} disabled={!(values.game && values.event_type && values.name)} type="primary" size='large' onClick={() => onSubmit({ eventType: values.event_type as string, game: values.game as string, name: values.name as string, triggerType })}>Add</Button>
    </div>
  );
}
