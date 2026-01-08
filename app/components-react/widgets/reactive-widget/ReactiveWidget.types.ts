import { IWidgetCommonState } from 'components-react/widgets/common/useWidget';

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

// ============================================================================
export interface IReactiveWidgetState extends IWidgetCommonState {
  data: { settings: ReactiveWidgetSettings };
  staticConfig: ReactiveStaticConfig;
}
