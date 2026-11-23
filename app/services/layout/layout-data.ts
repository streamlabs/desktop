import { $t } from 'services/i18n';

export enum ELayout {
  Default = 'Default',
  TwoThenThree = 'TwoThenThree',
  TwoPane = 'TwoPane',
  FourByFour = 'FourByFour',
  Triplets = 'Triplets',
  OnePane = 'OnePane',
  OnePaneR = 'OnePaneR',
  Pyramid = 'Pyramid',
}

export type TLayout = `${ELayout}`;

type ILayoutData = {
  [Layout in ELayout]: {
    resizeDefaults: { bar1: number; bar2: number };
    className: string;
    component: TLayout;
  };
};

export const LAYOUT_DATA: ILayoutData = {
  [ELayout.Default]: {
    resizeDefaults: { bar1: 0.4, bar2: 0 },
    className: 'default',
    component: 'Default',
  },
  [ELayout.TwoThenThree]: {
    resizeDefaults: { bar1: 0.2, bar2: 0.3 },
    className: 'twoThenThree',
    component: 'TwoThenThree',
  },
  [ELayout.TwoPane]: {
    resizeDefaults: { bar1: 0.5, bar2: 0.3 },
    className: 'twoPane',
    component: 'TwoPane',
  },
  [ELayout.FourByFour]: {
    resizeDefaults: { bar1: 0.25, bar2: 0.25 },
    className: 'fourByFour',
    component: 'FourByFour',
  },
  [ELayout.Triplets]: {
    resizeDefaults: { bar1: 0.6, bar2: 0.3 },
    className: 'triplets',
    component: 'Triplets',
  },
  [ELayout.OnePane]: {
    resizeDefaults: { bar1: 0.7, bar2: 0 },
    className: 'onePane',
    component: 'OnePane',
  },
  [ELayout.OnePaneR]: {
    resizeDefaults: { bar1: 0.3, bar2: 0 },
    className: 'onePaneR',
    component: 'OnePaneR',
  },
  [ELayout.Pyramid]: {
    resizeDefaults: { bar1: 0.4, bar2: 0 },
    className: 'pyramid',
    component: 'Pyramid',
  },
};

export enum EDockLayout {
  Single = 'Single',
  Stacked = 'Stacked',
}

export type TDockSlot = 'S1' | 'S2';

/**
 * The slots each dock layout provides. Stacked slots are ordered top to bottom.
 */
export const DOCK_SLOTS: Record<EDockLayout, TDockSlot[]> = {
  [EDockLayout.Single]: ['S1'],
  [EDockLayout.Stacked]: ['S1', 'S2'],
};

export function isDockSlot(slot: string | null | undefined): slot is TDockSlot {
  return slot === 'S1' || slot === 'S2';
}

/**
 * The elements that can be slotted into the layout editor.
 * @note The order of this enum determines the order of the elements in the layout editor sidebar.
 */
export enum ELayoutElement {
  Display = 'Display',
  Minifeed = 'Minifeed',
  Multichat = 'Multichat',
  Mixer = 'Mixer',
  Scenes = 'Scenes',
  Sources = 'Sources',
  StreamPreview = 'StreamPreview',
  RecordingPreview = 'RecordingPreview',
  Browser = 'Browser',
  LegacyEvents = 'LegacyEvents',
}

export type TLayoutElement = `${ELayoutElement}`;

type IElementData = {
  [Element in ELayoutElement]: {
    title: string;
    component: TLayoutElement;
  };
};

export const ELEMENT_DATA = (): IElementData => ({
  [ELayoutElement.Display]: {
    title: $t('Editor Display'),
    component: 'Display',
  },
  [ELayoutElement.Minifeed]: {
    title: $t('Mini Feed'),
    component: 'Minifeed',
  },
  [ELayoutElement.Mixer]: {
    title: $t('Audio Mixer'),
    component: 'Mixer',
  },
  [ELayoutElement.Multichat]: {
    title: $t('Chat'),
    component: 'Multichat',
  },
  [ELayoutElement.Scenes]: {
    title: $t('Scene Selector'),
    component: 'Scenes',
  },
  [ELayoutElement.Sources]: {
    title: $t('Source Selector'),
    component: 'Sources',
  },
  [ELayoutElement.LegacyEvents]: {
    title: $t('Legacy Events'),
    component: 'LegacyEvents',
  },
  [ELayoutElement.StreamPreview]: {
    title: $t('Stream Preview'),
    component: 'StreamPreview',
  },
  [ELayoutElement.RecordingPreview]: {
    title: $t('Recording Preview'),
    component: 'RecordingPreview',
  },
  [ELayoutElement.Browser]: {
    title: $t('Website'),
    component: 'Browser',
  },
});
