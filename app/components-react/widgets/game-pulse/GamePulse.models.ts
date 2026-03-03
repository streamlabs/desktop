import { IWidgetCommonState } from 'components-react/widgets/common/useWidget';

export enum TabKind {
  AddTrigger = 'add-trigger',
  General = 'general',
  GameManage = 'game-manage-trigger',
  TriggerDetail = 'trigger-detail',
}

export enum ScopeId {
  Global = 'global',
}

export enum TriggerType {
  Streak = 'streak',
  Achievement = 'achievement',
  Level = 'level',
  Total = 'total',
}

export type GamePulseLayout = 'above' | 'banner' | 'side';
export type GamePulseStreakPeriod = 'session' | 'today' | 'round';
export type GamePulseTriggerType = 'streak' | 'achievement' | 'level' | 'total';
export type GamePulseEventPeriod = 'round' | 'today' | null;

export interface GamePulseVoiceGroup {
  group: string;
  list: { key: string; value: string }[];
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface IGamePulseGroupOption {
  id: string;
  name: string;
  enabled: boolean;
}

export interface AnimationListItem {
  key: string;
  value: string;
}

export interface AnimationGroup {
  group: string;
  list: AnimationListItem[];
}

export interface AnimationOptionConfig {
  key: string;
  value: string;
  list?: AnimationOptionConfig[];
}

export interface GamePulseMediaSettings {
  image_href: string;
  sound_href: string;
  sound_volume: number;
  show_animation: string;
  hide_animation: string;
}

export interface GamePulseTextSettings {
  message_template: string;
  font: string;
  font_size: number;
  font_color: string;
  font_color2: string;
  font_weight: number;
  text_delay_ms: number;
  text_animation: string;
}

export interface GamePulseTtsSettings {
  enabled: boolean;
  language: string;
  security: number;
  repetition_block_length: number;
  volume: number;
  include_message_template: boolean;
}

export interface GamePulseBaseTrigger {
  id: string;
  enabled: boolean;
  name: string;
  game_event: string;
  layout: GamePulseLayout;
  alert_duration_ms: number;
  media_settings: GamePulseMediaSettings;
  text_settings: GamePulseTextSettings;
  tts_settings: GamePulseTtsSettings;
  event_period: GamePulseEventPeriod;
}

export interface GamePulseStreakTrigger extends GamePulseBaseTrigger {
  event_type: 'streak';
  streak_period: GamePulseStreakPeriod;
  amount_minimum: number;
  amount_maximum?: number | null;
}

export interface GamePulseAchievementTrigger extends GamePulseBaseTrigger {
  event_type: 'achievement';
  amount_minimum: number | null;
  amount_maximum: number | null;
}

export interface GamePulseLevelTrigger extends GamePulseBaseTrigger {
  event_type: 'level';
  amount_minimum?: number | null;
  amount_maximum?: number | null;
}

export interface GamePulseTotalTrigger extends GamePulseBaseTrigger {
  event_type: 'total';
  amount_minimum: number;
  amount_maximum?: number | null;
}

export type GamePulseTrigger =
  | GamePulseStreakTrigger
  | GamePulseAchievementTrigger
  | GamePulseLevelTrigger
  | GamePulseTotalTrigger;

export interface GamePulseTriggerGroup {
  enabled: boolean;
  triggers: GamePulseTrigger[];
}

export type GamePulseGamesMap = Record<string, GamePulseTriggerGroup | null | undefined>;

export interface GamePulseWidgetSettings {
  background_color: string;
  interrupt_mode: boolean;
  is_muted: boolean;
  global: GamePulseTriggerGroup;
  games: GamePulseGamesMap;
}

export interface GamePulseGameMeta {
  title: string;
  camel: string;
}

export interface GamePulseEventMeta {
  title: string;
  trigger_types: GamePulseTriggerType[];
}

export interface GamePulseWidgetAnimations {
  text_animations: AnimationGroup;
  show_animations: AnimationGroup;
  hide_animations: AnimationGroup;
}

export interface GamePulseWidgetOptions {
  games: Record<string, GamePulseGameMeta>;
  game_events: Record<string, GamePulseEventMeta>;
  global_events: Record<string, string>;
  streak_time_periods: Record<string, string>;
  available_game_events: Record<string, string[]>;
  event_time_periods: Record<string, string>;
  tts_voices?: Record<string, GamePulseVoiceGroup>;
}

export interface GamePulseStaticData {
  widget_type: string;
  title: string;
  options: GamePulseWidgetOptions;
  animations: GamePulseWidgetAnimations;
}

export interface GamePulseStaticConfig {
  success: boolean;
  message: string;
  data: GamePulseStaticData;
}

export interface TTSLanguagesResponse {
  success: boolean;
  data: Record<string, GamePulseVoiceGroup>;
  message?: string;
}

export interface GamePulseGameSettingsUI extends GamePulseTriggerGroup {
  gameId: string;
}

export interface ActiveTabContext {
  kind: TabKind;
  gameId?: string;
  triggerId?: string;
}

export interface IGamePulseWidgetState extends IWidgetCommonState {
  data: { settings: GamePulseWidgetSettings; showOnboarding?: boolean; showTutorial?: boolean };
  staticConfig: GamePulseStaticConfig;
}

// Constants

interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
}

export const EVENT_SORT_ORDER = ['elimination', 'victory', 'death', 'player_knocked'];

export const GAME_PULSE_API: Record<string, ApiEndpoint> = {
  ResetSettings: {
    path: 'widgets/desktop/game-pulse/reset-settings',
    method: 'POST',
  },
  DeleteTrigger: {
    path: 'widgets/desktop/game-pulse/trigger',
    method: 'DELETE',
  },
  TestTrigger: {
    path: 'widgets/desktop/game-pulse/test/trigger',
    method: 'POST',
  },
  PreviewTrigger: {
    path: 'widgets/desktop/game-pulse/preview/trigger',
    method: 'POST',
  },
  TTSLanguages: {
    path: 'tts/static/available-languages',
    method: 'GET',
  },
  DefaultSettings: {
    path: 'widgets/desktop/game-pulse/trigger/defaults',
    method: 'POST',
  },
};

export const EVENT_MEDIA_MAP: Record<string, string> = {
  death: 'https://cdn.streamlabs.com/library/animations/default-death.webm',
  defeat: 'https://cdn.streamlabs.com/library/animations/default-defeat.webm',
  victory: 'https://cdn.streamlabs.com/library/animations/default-victory.webm',
  elimination: 'https://cdn.streamlabs.com/library/animations/elimination.webm',
};

export const DEFAULTS = {
  MEDIA: 'https://cdn.streamlabs.com/library/giflibrary/jumpy-kevin.webm',
  SOUND: 'https://cdn.streamlabs.com/static/sounds/bits.ogg',
  GAME_EVENTS: ['elimination', 'victory', 'death', 'assist', 'knockout'],
  FONT: 'Open Sans',
  FONT_COLOR: '#FFFFFF',
  FONT_COLOR_ACCENT: '#80F5D2',
};

export const DEFAULT_TRIGGER_SETTINGS = {
  media_settings: {
    image_href: DEFAULTS.MEDIA,
    sound_href: DEFAULTS.SOUND,
    sound_volume: 50,
    show_animation: 'fadeIn',
    hide_animation: 'fadeOut',
  },
  text_settings: {
    font: DEFAULTS.FONT,
    font_color: DEFAULTS.FONT_COLOR,
    font_color2: DEFAULTS.FONT_COLOR_ACCENT,
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
  game_event: 'kill',
  id: '',
  name: '',
  layout: 'above' as const,
};

export const GAME_PULSE_TABS_SEPARATOR = '::';

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

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
