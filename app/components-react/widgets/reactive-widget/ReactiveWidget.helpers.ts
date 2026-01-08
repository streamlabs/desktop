import { AnimationOptionConfig, ActiveTabContext, SelectOption, TabKind, ReactiveTrigger, ReactiveTriggerType, ReactiveEventPeriod } from './ReactiveWidget.types';

const DEFAULT_TRIGGER_SETTINGS = {
  media_settings: {
    image_href: 'https://cdn.streamlabs.com/library/giflibrary/jumpy-kevin.webm',
    sound_href: 'https://cdn.streamlabs.com/static/sounds/bits.ogg',
    sound_volume: 50,
    show_animation: 'fadeIn',
    hide_animation: 'fadeOut',
  },
  text_settings: {
    font: 'Open Sans',
    font_color: '#FFFFFF',
    font_color2: '#80F5D2',
    font_size: 24,
    font_weight: 400,
    message_template: '{number} kill streak!',
    text_animation: 'bounce',
    text_delay_ms: 0,
  },
  tts_settings: {
    enabled: false,
    include_message_template: true,
    language: 'Salli',
    repetition_block_length: 1,
    security: 0,
    volume: 50,
  },
  alert_duration_ms: 5000,
  enabled: true,
  game_event: 'kill', // Is this always 'kill' by default?
  id: '',
  name: '',
  layout: 'above' as const,
};

export function flattenAnimationOptions(
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



/**
 * Centralized util for managing the "Tab ID" strings used in the Reactive Widget.
 *
 * We use a flat string (e.g., "valorant-trigger-123") to represent deep navigation states.
 *
 * @example
 * UI: Generating a key for a menu item
 * <Menu.Item key={ReactiveTabUtils.generateTriggerId('valorant', '123')} />
 *
 * Logic: determining what to render based on the selected tab string
 * const { kind, gameId } = ReactiveTabUtils.parse(selectedTab);
 */
export const ReactiveTabUtils = {
  ID_ADD_TRIGGER: TabKind.AddTrigger,
  ID_GENERAL: TabKind.General,
  generateManageGameId: (gameId: string) => `${gameId}-manage-trigger`,
  generateTriggerId: (gameId: string, triggerId: string | null) => `${gameId}-trigger-${triggerId}`,
  parse: (tabId: string | undefined | null): ActiveTabContext => {
    if (!tabId || typeof tabId !== 'string') return { kind: TabKind.General };

    if (tabId === TabKind.AddTrigger) return { kind: TabKind.AddTrigger };
    if (tabId === TabKind.General) return { kind: TabKind.General };

    if (tabId.includes('-trigger-')) {
      const parts = tabId.split('-trigger-');
      if (parts.length >= 2) {
        return { kind: TabKind.TriggerDetail, gameId: parts[0], triggerId: parts[1] };
      }
    }

    if (tabId.endsWith('-manage-trigger')) {
      return {
        kind: TabKind.GameManage,
        gameId: tabId.replace('-manage-trigger', ''),
      };
    }

    return { kind: TabKind.General };
  },
};

/** default trigger settings, used as a template for new triggers */
export function defaultMediaForEvent(eventKey: string): string {
  switch (eventKey) {
    case 'death': return 'https://cdn.streamlabs.com/library/animations/default-death.webm';
    case 'defeat': return 'https://cdn.streamlabs.com/library/animations/default-defeat.webm';
    case 'victory': return 'https://cdn.streamlabs.com/library/animations/default-victory.webm';
    case 'elimination': return 'https://cdn.streamlabs.com/library/animations/elimination.webm';
    default: return 'https://cdn.streamlabs.com/library/giflibrary/jumpy-kevin.webm';
  }
}

export function defaultMessageTemplate(
  triggerType: ReactiveTriggerType,
  eventKey: string,
): string {
  const token = '{number}';
  if (triggerType === 'level') return `${eventKey}: ${token}`;
  if (triggerType === 'streak') return `${token} ${eventKey}`;
  if (triggerType === 'total') return `${eventKey} total: ${token}`;
  return eventKey;
}

export function defaultEventPeriod(triggerType: ReactiveTriggerType): ReactiveEventPeriod {
  if (triggerType === 'total') return 'today';
  if (triggerType === 'streak') return 'round';
  return null;
}

/** default trigger settings, used as a template for new triggers */
export function generateTriggerSettings(event_type: ReactiveTriggerType): ReactiveTrigger {
  switch (event_type) {
    case 'streak':
      return {
        ...DEFAULT_TRIGGER_SETTINGS,
        event_type,
        amount_minimum: 1,
        amount_maximum: null,
        streak_period: 'session',
        event_period: 'round',
      };

    case 'total':
      return {
        ...DEFAULT_TRIGGER_SETTINGS,
        event_type,
        amount_minimum: 1,
        amount_maximum: null,
        event_period: 'today',
      };

    case 'achievement':
      return {
        ...DEFAULT_TRIGGER_SETTINGS,
        event_type,
        amount_minimum: null,
        amount_maximum: null,
        event_period: null,
      };

    default:
      return {
        ...DEFAULT_TRIGGER_SETTINGS,
        event_type,
      } as ReactiveTrigger;
  }
}

export function buildNewTrigger(params: {
  triggerType: ReactiveTriggerType;
  eventKey: string;
  name: string;
}): ReactiveTrigger {
  const { triggerType, eventKey, name } = params;
  const base = generateTriggerSettings(triggerType);

  return {
    ...base,
    name,
    game_event: eventKey,
    event_period: defaultEventPeriod(triggerType),
    media_settings: {
      ...base.media_settings,
      image_href: defaultMediaForEvent(eventKey),
    },
    text_settings: {
      ...base.text_settings,
      message_template: defaultMessageTemplate(triggerType, eventKey),
    },
  };
}

export function sanitizeTrigger(raw: ReactiveTrigger): ReactiveTrigger {
  const trigger = structuredClone(raw) as any; // use 'any' to allow deletion of properties

  if (trigger.event_type !== 'streak') {
    // the server might send them anyway, so we yeet them just in case.
    delete trigger.streak_period;
    delete trigger.amount_minimum;
    delete trigger.amount_maximum;
  }

  return trigger as ReactiveTrigger;
}