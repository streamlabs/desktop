import { EEncoderFamily } from 'services/settings';

export interface IEncoderProfile {
  game: string;
  encoder: EEncoderFamily;
  codec?: string;
  bitrateMin: number;
  bitrateMax: number;
  presetIn: string;
  presetOut: string;
  resolutionIn: string;
  resolutionOut: string;
  options: string;
  description?: string;
}
