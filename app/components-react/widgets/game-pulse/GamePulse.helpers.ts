import { EVENT_SORT_ORDER, DEFAULT_TRIGGER_SETTINGS, EVENT_MEDIA_MAP, DEFAULTS, GAME_PULSE_TABS_SEPARATOR } from './GamePulse.consts';
import {
  ActiveTabContext,
  TabKind,
  GamePulseTrigger,
  GamePulseTriggerType,
  GamePulseEventPeriod,
} from './GamePulse.types';


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
  generateManageGameId: (gameId: string) => `${gameId}${GAME_PULSE_TABS_SEPARATOR}manage`,
  generateTriggerId: (gameId: string, triggerId: string | null) =>
    `${gameId}${GAME_PULSE_TABS_SEPARATOR}trigger${GAME_PULSE_TABS_SEPARATOR}${triggerId}`,
  parse: (tabId: string | undefined | null): ActiveTabContext => {
    if (!tabId || typeof tabId !== 'string') return { kind: TabKind.General };

    if (tabId === TabKind.AddTrigger) return { kind: TabKind.AddTrigger };
    if (tabId === TabKind.General) return { kind: TabKind.General };

    if (tabId.endsWith(`${GAME_PULSE_TABS_SEPARATOR}manage`)) {
      const gameId = tabId.replace(`${GAME_PULSE_TABS_SEPARATOR}manage`, '');
      return { kind: TabKind.GameManage, gameId };
    }

    if (tabId.includes(`${GAME_PULSE_TABS_SEPARATOR}trigger${GAME_PULSE_TABS_SEPARATOR}`)) {
      const splitSequence = `${GAME_PULSE_TABS_SEPARATOR}trigger${GAME_PULSE_TABS_SEPARATOR}`;
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
  const baseSettings = { ...DEFAULT_TRIGGER_SETTINGS, event_type };

  switch (event_type) {
    case 'streak':
      return {
        ...baseSettings,
        amount_minimum: 1,
        amount_maximum: null,
        streak_period: 'session',
        event_period: 'round',
      } as GamePulseTrigger;

    case 'total':
      return {
        ...baseSettings,
        amount_minimum: 1,
        amount_maximum: null,
        event_period: 'today',
      } as GamePulseTrigger;

    case 'achievement':
      return {
        ...baseSettings,
        amount_minimum: null,
        amount_maximum: null,
        event_period: null,
      } as GamePulseTrigger;

    default:
      return baseSettings as GamePulseTrigger;
  }
}

/** default trigger settings, used as a template for new triggers */
export function defaultMediaForEvent(eventKey: string): string {
  return EVENT_MEDIA_MAP[eventKey] ?? DEFAULTS.MEDIA;
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

export function sortEventKeys(a: string, b: string): number {
  const indexA = EVENT_SORT_ORDER.indexOf(a);
  const indexB = EVENT_SORT_ORDER.indexOf(b);

  if (indexA >= 0 && indexB >= 0) return indexA - indexB;
  if (indexA >= 0) return -1;
  if (indexB >= 0) return 1;

  return a.localeCompare(b);
}