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

export enum ApiEndpoints {
  ResetSettings = 'widgets/desktop/game-pulse/reset-settings',
  DeleteTrigger = 'widgets/desktop/game-pulse/trigger',
  PreviewTrigger = 'widgets/desktop/game-pulse/preview/trigger',
  TTSLanguages = 'tts/static/available-languages',
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

export interface GamePulseGameSettingsUI extends GamePulseTriggerGroup {
  gameId: string;
}

export interface ActiveTabContext {
  kind: TabKind;
  gameId?: string;
  triggerId?: string;
}

export interface IGamePulseWidgetState extends IWidgetCommonState {
  data: { settings: GamePulseWidgetSettings };
  staticConfig: GamePulseStaticConfig;
}