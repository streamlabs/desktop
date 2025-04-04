import { ISubtitleStyle } from '../models/rendering.models';

export type SubtitleStyleName = 'default' | 'flashy' | 'thick';

export const SubtitleStyles: { [name in SubtitleStyleName]: ISubtitleStyle } = {
  default: {
    fontColor: '#FFFFFF',
    fontSize: 48,
    fontFamily: 'Arial',
    strokeColor: '#FF000',
    strokeWidth: 1,
  },
  flashy: {
    fontColor: '#FF00FF',
    fontSize: 48,
    fontFamily: 'Arial',
    strokeColor: '#FF000',
    strokeWidth: 2,
  },
  thick: {
    fontFamily: 'Impact',
    fontSize: 48,
    fontColor: '#FFFFFF',
    strokeColor: '#FF000',
    strokeWidth: 6,
  },
};
