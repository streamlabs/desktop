import cloneDeep from 'lodash/cloneDeep';

export type ReactiveLayout = 'above' | 'banner' | 'side';
export type ReactiveStreakPeriod = 'session' | 'today' | 'round';
export type ReactiveTriggerType = 'streak' | 'achievement' | 'level' | 'total';
export type ReactiveEventPeriod = 'round' | 'today' | null;

export interface ReactiveMediaSettings {
  image_href: string;
  sound_href: string;
  sound_volume: number;
  show_animation: string;
  hide_animation: string;
}

export interface ReactiveTextSettings {
  message_template: string;
  font: string;
  font_size: number;
  font_color: string;
  font_color2: string;
  font_weight: number;
  text_delay_ms: number;
  text_animation: string;
}

export interface ReactiveTtsSettings {
  enabled: boolean;
  language: string;
  security: number;
  repetition_block_length: number;
  volume: number;
  include_message_template: boolean;
}

export interface ReactiveBaseTrigger {
  id: string;
  enabled: boolean;
  name: string;
  game_event: string;
  layout: ReactiveLayout;
  alert_duration_ms: number;
  media_settings: ReactiveMediaSettings;
  text_settings: ReactiveTextSettings;
  tts_settings: ReactiveTtsSettings;
  event_period: ReactiveEventPeriod;
}

export interface ReactiveStreakTrigger extends ReactiveBaseTrigger {
  event_type: 'streak';
  streak_period: ReactiveStreakPeriod;
  amount_minimum: number;
  amount_maximum?: number | null;
}

export interface ReactiveAchievementTrigger extends ReactiveBaseTrigger {
  event_type: 'achievement';
  amount_minimum: number | null;
  amount_maximum: number | null;
}

export interface ReactiveLevelTrigger extends ReactiveBaseTrigger {
  event_type: 'level';
  amount_minimum?: number | null;
  amount_maximum?: number | null;
}

export interface ReactiveTotalTrigger extends ReactiveBaseTrigger {
  event_type: 'total';
  amount_minimum: number;
  amount_maximum?: number | null;
}

export type ReactiveTrigger = 
  | ReactiveStreakTrigger 
  | ReactiveAchievementTrigger 
  | ReactiveLevelTrigger
  | ReactiveTotalTrigger;

export interface ReactiveTriggerGroup {
  enabled: boolean;
  triggers: ReactiveTrigger[];
}

export interface ReactiveGameSettingsUI extends ReactiveTriggerGroup {
  gameId: string;
}

export type ReactiveGamesMap = Record<string, ReactiveTriggerGroup | null | undefined>;

export interface ReactiveWidgetSettings {
  background_color: string;
  interrupt_mode: boolean;
  is_muted: boolean;
  global: ReactiveTriggerGroup;
  games: ReactiveGamesMap;
}

export interface IReactiveGroupOption {
  id: string;
  name: string;
  enabled: boolean;
}

export interface ReactiveWidgetOptions {
  games: Record<string, ReactiveGameMeta>;
  game_events: Record<string, ReactiveEventMeta>;
  global_events: Record<string, string>;
  streak_time_periods: Record<string, string>;
  available_game_events: Record<string, string[]>;
  event_time_periods: Record<string, string>;
}

export interface AnimationListItem {
  key: string;
  value: string;
}

export interface AnimationGroup {
  group: string;
  list: AnimationListItem[];
}

export interface ReactiveWidgetAnimations {
  text_animations: AnimationGroup;
  show_animations: AnimationGroup;
  hide_animations: AnimationGroup;
}

export interface ReactiveStaticData {
  widget_type: string;
  title: string;
  options: ReactiveWidgetOptions;
  animations: ReactiveWidgetAnimations;
}

export interface ReactiveStaticConfig {
  success: boolean;
  message: string;
  data: ReactiveStaticData;
}

export interface ReactiveGameMeta {
  title: string;
  camel: string;
}

export interface ReactiveEventMeta {
  title: string;
  trigger_types: ReactiveTriggerType[];
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface AnimationOptionConfig {
  key: string;
  value: string;
  list?: AnimationOptionConfig[];
}

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

// ============================================================================
// TAB CONSTANTS & UTILS
// ============================================================================

export enum TabKind {
  AddTrigger = 'add-trigger',
  General = 'general',
  GameManage = 'game-manage-trigger',
  TriggerDetail = 'trigger-detail',
}

export interface ActiveTabContext {
  kind: TabKind;
  gameId?: string;
  triggerId?: string;
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
  const trigger = cloneDeep(raw) as any; // use 'any' to allow deletion of properties

  if (trigger.event_type !== 'streak') {
    // the server might send them anyway, so we yeet them just in case.
    delete trigger.streak_period;
    // TODO: $chris: remove amount min/max? see if they cause issues with other event
    delete trigger.amount_minimum;
    delete trigger.amount_maximum;
  }

  return trigger as ReactiveTrigger;
}