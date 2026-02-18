import {
  ActiveTabContext,
  TabKind,
  GamePulseTrigger,
  GamePulseTriggerType,
  GamePulseEventPeriod,
} from './GamePulse.types';

const EVENT_MEDIA_MAP: Record<string, string> = {
  death: 'https://cdn.streamlabs.com/library/animations/default-death.webm',
  defeat: 'https://cdn.streamlabs.com/library/animations/default-defeat.webm',
  victory: 'https://cdn.streamlabs.com/library/animations/default-victory.webm',
  elimination: 'https://cdn.streamlabs.com/library/animations/elimination.webm',
};
const DEFAULT_MEDIA = 'https://cdn.streamlabs.com/library/giflibrary/jumpy-kevin.webm';
const DEFAULT_SOUND = 'https://cdn.streamlabs.com/static/sounds/bits.ogg';

const DEFAULT_TRIGGER_SETTINGS = {
  media_settings: {
    image_href: DEFAULT_MEDIA,
    sound_href: DEFAULT_SOUND,
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

const SEPARATOR = '::';

/**
 * Centralized util for managing the "Tab ID" strings used in the GamePulse Widget.
 *
 * We use a flat string (e.g., "valorant-trigger-123") to represent deep navigation states.
 *
 * @example
 * UI: Generating a key for a menu item
 * <Menu.Item key={GamePulseTabUtils.generateTriggerId('valorant', '123')} />
 *
 * Logic: determining what to render based on the selected tab string
 * const { kind, gameId } = GamePulseTabUtils.parse(selectedTab);
 */
export const GamePulseTabUtils = {
  ID_ADD_TRIGGER: TabKind.AddTrigger,
  ID_GENERAL: TabKind.General,
  generateManageGameId: (gameId: string) => `${gameId}${SEPARATOR}manage`,
  generateTriggerId: (gameId: string, triggerId: string | null) =>
    `${gameId}${SEPARATOR}trigger${SEPARATOR}${triggerId}`,
  parse: (tabId: string | undefined | null): ActiveTabContext => {
    if (!tabId || typeof tabId !== 'string') return { kind: TabKind.General };

    if (tabId === TabKind.AddTrigger) return { kind: TabKind.AddTrigger };
    if (tabId === TabKind.General) return { kind: TabKind.General };

    if (tabId.endsWith(`${SEPARATOR}manage`)) {
      const gameId = tabId.replace(`${SEPARATOR}manage`, '');
      return { kind: TabKind.GameManage, gameId };
    }

    if (tabId.includes(`${SEPARATOR}trigger${SEPARATOR}`)) {
      const splitSequence = `${SEPARATOR}trigger${SEPARATOR}`;
      const lastIndex = tabId.lastIndexOf(splitSequence);

      if (lastIndex !== -1) {
        const gameId = tabId.substring(0, lastIndex);
        const triggerId = tabId.substring(lastIndex + splitSequence.length);

        if (gameId && triggerId) {
          return { kind: TabKind.TriggerDetail, gameId, triggerId };
        }
      }
    }

    return { kind: TabKind.General };
  },
};

/** default trigger settings, used as a template for new triggers */
export function defaultMediaForEvent(eventKey: string): string {
  return EVENT_MEDIA_MAP[eventKey] ?? DEFAULT_MEDIA;
}

export function defaultMessageTemplate(
  triggerType: GamePulseTriggerType,
  eventKey: string,
): string {
  const token = '{number}';
  if (triggerType === 'level') return `${eventKey}: ${token}`;
  if (triggerType === 'streak') return `${token} ${eventKey}`;
  if (triggerType === 'total') return `${eventKey} total: ${token}`;
  return eventKey;
}

export function defaultEventPeriod(triggerType: GamePulseTriggerType): GamePulseEventPeriod {
  if (triggerType === 'total') return 'today';
  if (triggerType === 'streak') return 'round';
  return null;
}

/** default trigger settings, used as a template for new triggers */
export function generateTriggerSettings(event_type: GamePulseTriggerType): GamePulseTrigger {
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
      } as GamePulseTrigger;
  }
}

export function buildNewTrigger(params: {
  triggerType: GamePulseTriggerType;
  eventKey: string;
  name: string;
}): GamePulseTrigger {
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

const EVENT_SORT_ORDER = ['elimination', 'victory', 'death', 'player_knocked'];
export function sortEventKeys(a: string, b: string): number {
  const indexA = EVENT_SORT_ORDER.indexOf(a);
  const indexB = EVENT_SORT_ORDER.indexOf(b);

  if (indexA >= 0 && indexB >= 0) return indexA - indexB;
  if (indexA >= 0) return -1;
  if (indexB >= 0) return 1;

  return a.localeCompare(b);
}