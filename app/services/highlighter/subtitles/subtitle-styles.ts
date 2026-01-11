import { ISubtitleStyle } from '../models/rendering.models';

export type SubtitleStyleName = 'basic' | 'thick' | 'flashyA' | 'yellow';

export const SubtitleStyles: { [name in SubtitleStyleName]: ISubtitleStyle } = {
  basic: {
    fontColor: '#FFFFFF',
    fontSize: 48,
    fontFamily: 'Arial',
    strokeColor: '#000000',
    strokeWidth: 2,
  },
  thick: {
    fontFamily: 'Impact',
    fontSize: 48,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 6,
  },
  flashyA: {
    fontColor: '#FFFFFF',
    fontSize: 48,
    fontFamily: 'Showcard Gothic',
    strokeColor: '#000000',
    strokeWidth: 6,
  },
  yellow: {
    fontColor: '#f6f154',
    fontSize: 48,
    fontFamily: 'Arial',
    strokeColor: '#000000',
    strokeWidth: 6,
  },
};
