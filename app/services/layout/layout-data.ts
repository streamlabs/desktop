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

export enum EDockLayout {
  Single = 'Single',
  Stacked = 'Stacked',
}

export type TDockSlot = 'S1' | 'S2';

export type TLayoutSlot = '1' | '2' | '3' | '4' | '5' | '6' | TDockSlot;

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

export type TSlottedElements = Partial<Record<ELayoutElement, { slot: TLayoutSlot; src?: string }>>;

/** Elements that fill a slot as a last resort: the ones that need setup are never picked. */
const FALLBACK_ELEMENTS = Object.values(ELayoutElement).filter(
  el =>
    ![
      ELayoutElement.Browser,
      ELayoutElement.LegacyEvents,
      ELayoutElement.RecordingPreview,
    ].includes(el),
);

type ILayoutData = {
  [Layout in ELayout]: {
    resizeDefaults: { bar1: number; bar2: number };
    className: string;
    component: TLayout;
    /** The main slots the layout renders. */
    slots: TLayoutSlot[];
    /** The elements placed in empty slots, by dock layout. Includes the dock's elements. */
    defaultSlots: Record<EDockLayout, TSlottedElements>;
  };
};

/**
 * Builds the default slots of a layout from its elements ordered by slot number,
 * where null leaves a slot empty.
 */
function genDefaultSlots(single: (ELayoutElement | null)[], stacked: (ELayoutElement | null)[]) {
  const build = (main: (ELayoutElement | null)[], dock: EDockLayout) => {
    const slotted: TSlottedElements = {};
    main.forEach((el, i) => {
      if (el) slotted[el] = { slot: String(i + 1) as TLayoutSlot };
    });
    return { ...slotted, ...DOCK_DEFAULTS[dock] };
  };
  return {
    [EDockLayout.Single]: build(single, EDockLayout.Single),
    [EDockLayout.Stacked]: build(stacked, EDockLayout.Stacked),
  };
}

/** The elements of the dock for each dock layout, which are the same for every layout. */
const DOCK_DEFAULTS: Record<EDockLayout, TSlottedElements> = {
  [EDockLayout.Single]: { [ELayoutElement.Multichat]: { slot: 'S1' } },
  [EDockLayout.Stacked]: {
    [ELayoutElement.Minifeed]: { slot: 'S1' },
    [ELayoutElement.Multichat]: { slot: 'S2' },
  },
};

export const LAYOUT_DATA: ILayoutData = {
  [ELayout.Default]: {
    resizeDefaults: { bar1: 0.4, bar2: 0 },
    className: 'default',
    component: 'Default',
    slots: ['1', '2', '3', '4'],
    defaultSlots: genDefaultSlots(
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Minifeed,
      ],
      [ELayoutElement.Display, ELayoutElement.Scenes, ELayoutElement.Sources, ELayoutElement.Mixer],
    ),
  },
  [ELayout.TwoThenThree]: {
    resizeDefaults: { bar1: 0.2, bar2: 0.3 },
    className: 'twoThenThree',
    component: 'TwoThenThree',
    slots: ['1', '2', '3', '4', '5'],
    defaultSlots: genDefaultSlots(
      [
        ELayoutElement.Display,
        ELayoutElement.Minifeed,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
      ],
      [
        ELayoutElement.Display,
        ELayoutElement.Mixer,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.StreamPreview,
      ],
    ),
  },
  [ELayout.TwoPane]: {
    resizeDefaults: { bar1: 0.5, bar2: 0.3 },
    className: 'twoPane',
    component: 'TwoPane',
    slots: ['1', '2', '3', '4', '5'],
    defaultSlots: genDefaultSlots(
      [
        ELayoutElement.Display,
        ELayoutElement.Minifeed,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
      ],
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        ELayoutElement.Mixer,
        ELayoutElement.StreamPreview,
        ELayoutElement.Sources,
      ],
    ),
  },
  [ELayout.FourByFour]: {
    resizeDefaults: { bar1: 0.25, bar2: 0.25 },
    className: 'fourByFour',
    component: 'FourByFour',
    slots: ['1', '2', '3', '4', '5'],
    defaultSlots: genDefaultSlots(
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
        ELayoutElement.Minifeed,
      ],
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
        ELayoutElement.StreamPreview,
      ],
    ),
  },
  [ELayout.Triplets]: {
    resizeDefaults: { bar1: 0.6, bar2: 0.3 },
    className: 'triplets',
    component: 'Triplets',
    slots: ['1', '2', '3', '4', '5', '6'],
    defaultSlots: genDefaultSlots(
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        ELayoutElement.Minifeed,
        ELayoutElement.StreamPreview,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
      ],
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        null,
        ELayoutElement.StreamPreview,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
      ],
    ),
  },
  [ELayout.OnePane]: {
    resizeDefaults: { bar1: 0.7, bar2: 0 },
    className: 'onePane',
    component: 'OnePane',
    slots: ['1', '2', '3', '4', '5'],
    defaultSlots: genDefaultSlots(
      [
        ELayoutElement.Display,
        ELayoutElement.Minifeed,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
      ],
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
        ELayoutElement.StreamPreview,
      ],
    ),
  },
  [ELayout.OnePaneR]: {
    resizeDefaults: { bar1: 0.3, bar2: 0 },
    className: 'onePaneR',
    component: 'OnePaneR',
    slots: ['1', '2', '3', '4', '5'],
    defaultSlots: genDefaultSlots(
      [
        ELayoutElement.Display,
        ELayoutElement.Minifeed,
        ELayoutElement.Scenes,
        ELayoutElement.Sources,
        ELayoutElement.Mixer,
      ],
      [
        ELayoutElement.Display,
        ELayoutElement.Scenes,
        ELayoutElement.StreamPreview,
        ELayoutElement.Mixer,
        ELayoutElement.Sources,
      ],
    ),
  },
  [ELayout.Pyramid]: {
    resizeDefaults: { bar1: 0.4, bar2: 0 },
    className: 'pyramid',
    component: 'Pyramid',
    slots: ['1', '2', '3'],
    defaultSlots: genDefaultSlots(
      [ELayoutElement.Display, ELayoutElement.Scenes, ELayoutElement.Sources],
      [ELayoutElement.Display, ELayoutElement.Scenes, ELayoutElement.Sources],
    ),
  },
};

/**
 * The slots that are rendered by a layout combined with a dock layout.
 */
export function visibleSlots(layout: ELayout, dockLayout: EDockLayout): TLayoutSlot[] {
  return [...LAYOUT_DATA[layout].slots, ...DOCK_SLOTS[dockLayout]];
}

/** The slot an element is placed in, if any. Also reads the unversioned `{ el: 'slot' }` format. */
function slotOf(value: { slot: TLayoutSlot } | string | null | undefined) {
  return (typeof value === 'string' ? value : value?.slot) || null;
}

/**
 * Whether the main layout (or the dock) holds exactly the default elements of a layout and dock
 * layout. Used to migrate persisted layouts, which didn't record whether they were customized.
 */
export function hasDefaultSlots(
  region: 'main' | 'dock',
  layout: ELayout,
  dockLayout: EDockLayout,
  slotted: Record<string, { slot: TLayoutSlot } | string | null | undefined>,
): boolean {
  const inRegion = (slot: string | null) => !!slot && isDockSlot(slot) === (region === 'dock');
  const defaults = LAYOUT_DATA[layout].defaultSlots[dockLayout];
  const placed = Object.keys(slotted).filter(el => inRegion(slotOf(slotted[el])));
  const defaulted = (Object.keys(defaults) as ELayoutElement[]).filter(el =>
    inRegion(defaults[el]?.slot ?? null),
  );
  return (
    placed.length === defaulted.length &&
    defaulted.every(el => slotOf(slotted[el]) === defaults[el]?.slot)
  );
}

/**
 * Moves the main layout and/or the dock to the defaults of a layout and dock layout.
 * An element that stays in the other region keeps its place and isn't used for the defaults.
 */
export function applyDefaults(
  layout: ELayout,
  dockLayout: EDockLayout,
  slotted: TSlottedElements,
  reset: { main: boolean; dock: boolean },
): TSlottedElements {
  const inResetRegion = (slot: TLayoutSlot) => (isDockSlot(slot) ? reset.dock : reset.main);
  const result: TSlottedElements = { ...slotted };
  (Object.keys(result) as ELayoutElement[]).forEach(el => {
    const slot = result[el]?.slot as TLayoutSlot;
    if (slot && inResetRegion(slot)) result[el] = { slot: (null as unknown) as TLayoutSlot };
  });

  const defaults = LAYOUT_DATA[layout].defaultSlots[dockLayout];
  (Object.keys(defaults) as ELayoutElement[]).forEach(el => {
    const slot = defaults[el]?.slot as TLayoutSlot;
    if (inResetRegion(slot) && !result[el]?.slot) result[el] = { slot };
  });

  return result;
}

/**
 * Fills each empty visible slot, never using an element that is already slotted, with:
 * 1. the slot's default for the layout and dock layout,
 * 2. its default for the layout and the other dock layout,
 * 3. the first element, in the order of `ELayoutElement`, that isn't slotted.
 * The Display is never placed in the dock.
 */
export function fillEmptySlots(
  layout: ELayout,
  dockLayout: EDockLayout,
  slotted: TSlottedElements,
): TSlottedElements {
  const result: TSlottedElements = { ...slotted };
  const otherDock = dockLayout === EDockLayout.Single ? EDockLayout.Stacked : EDockLayout.Single;
  const elementAt = (slot: TLayoutSlot) =>
    (Object.keys(result) as ELayoutElement[]).find(el => result[el]?.slot === slot);
  const defaultAt = (dock: EDockLayout, slot: TLayoutSlot) => {
    const defaults = LAYOUT_DATA[layout].defaultSlots[dock];
    return (Object.keys(defaults) as ELayoutElement[]).find(el => defaults[el]?.slot === slot);
  };

  visibleSlots(layout, dockLayout).forEach(slot => {
    if (elementAt(slot)) return;
    const candidates = [
      defaultAt(dockLayout, slot),
      defaultAt(otherDock, slot),
      ...FALLBACK_ELEMENTS,
    ];
    const el = candidates.find(
      c => c && !result[c]?.slot && !(c === ELayoutElement.Display && isDockSlot(slot)),
    );
    if (el) result[el] = { slot };
  });

  return result;
}

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
