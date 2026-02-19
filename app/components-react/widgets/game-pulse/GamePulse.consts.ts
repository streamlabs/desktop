export const EVENT_SORT_ORDER = ['elimination', 'victory', 'death', 'player_knocked'];

interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
}

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
