export enum SubtitleMode {
  disabled = 'disabled',
  dynamic = 'dynamic',
  static = 'static',
}
export type TSubtitleHighlightStyle = 'none' | 'background' | 'opacity';

export interface ISubtitleConfig {
  subtitleMode?: SubtitleMode;
  subtitleLength?: number;

  bgColor?: string;
  bg?: boolean;
}
