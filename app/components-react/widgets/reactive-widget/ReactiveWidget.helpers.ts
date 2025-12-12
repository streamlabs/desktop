export type ReactiveLayout = 'above' | 'banner' | 'side';
export type ReactiveStreakPeriod = 'session' | 'today' | 'round';

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
  id: string | null;
  enabled: boolean;
  name: string;
  game_event: string;
  layout: ReactiveLayout;
  alert_duration_ms: number;
  media_settings: ReactiveMediaSettings;
  text_settings: ReactiveTextSettings;
  tts_settings: ReactiveTtsSettings;
}

export interface ReactiveStreakTrigger extends ReactiveBaseTrigger {
  type: 'streak';
  streak_period: ReactiveStreakPeriod;
  amount_minimum: number;
  amount_maximum?: number | null;
}

export interface ReactiveAchievementTrigger extends ReactiveBaseTrigger {
  type: 'achievement';
  streak_period?: undefined;
  amount_minimum?: undefined;
  amount_maximum?: undefined;
}

export type ReactiveTrigger = ReactiveStreakTrigger | ReactiveAchievementTrigger;

export interface ReactiveTriggerGroup {
  enabled: boolean;
  triggers: ReactiveTrigger[];
}

export type ReactiveGamesMap = Record<string, ReactiveTriggerGroup | null | undefined>;

export type IReactiveWidgetTrigger = ReactiveTrigger;

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
  generateTriggerId: (gameId: string, triggerId: string) => `${gameId}-trigger-${triggerId}`,
  parse: (tabId: string | undefined | null): ActiveTabContext => {
    if (!tabId || typeof tabId !== 'string') return { kind: TabKind.General };

    if (tabId === ReactiveTabUtils.ID_ADD_TRIGGER) return { kind: TabKind.AddTrigger };
    if (tabId === ReactiveTabUtils.ID_GENERAL) return { kind: TabKind.General };

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

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

/** default trigger settings, used as a template for new triggers */
export const defaultTriggerSettings: ReactiveTrigger = {
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
  amount_maximum: null,
  amount_minimum: 1,
  enabled: true,
  game_event: 'kill',
  id: null,
  name: '',
  layout: 'above',
  type: 'streak',
  streak_period: 'session',
};
