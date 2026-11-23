import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { TLayoutSlot, IVec2Array, ELayoutElement } from 'services/layout';
import { useVuex, useDebounce } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { fitSections } from './fit';

export class LayoutProps {
  onTotalWidth: (slots: IVec2Array, isColumns: boolean) => void = () => {};
  childrenMins: Dictionary<IVec2>;
  className?: string;
}

export interface IResizeMins {
  rest: number | null;
  bar1: number | null;
  bar2: number | null;
}

export interface ILayoutProps extends React.PropsWithChildren<LayoutProps> {
  children: Partial<Record<TLayoutSlot, React.ReactNode>>;
}

export interface ILayoutSlotArray extends Array<ILayoutSlotArray | TLayoutSlot> {}

function flattenSlots(slots: ILayoutSlotArray): TLayoutSlot[] {
  return slots.flatMap(slot => (Array.isArray(slot) ? flattenSlots(slot) : [slot]));
}

/**
 * Just a note on some of the more unique params
 * @param vectors is a two-dimensional array that describes the shape of the layout.
 * the primary array describes the primary, resizable portions of the layout,
 * while the inner arrays describe non-resizable subdivisions of each resizable slice.
 * @param isColumns determines whether the layout in question has vertical
 * or horizontal resize bars and thus is either primarily column or row based
 */
export default function useLayout(
  vectors: ILayoutSlotArray[],
  isColumns: boolean,
  childrenMins: Dictionary<IVec2>,
  onTotalWidth: (slots: IVec2Array, isColumns: boolean) => void = () => {},
) {
  const { CustomizationService, LayoutService } = Services;

  const { resizes, chatCollapsed, displaySlot } = useVuex(() => ({
    resizes: LayoutService.views.currentTab.resizes,
    chatCollapsed: CustomizationService.state.dockCollapsed,
    displaySlot: LayoutService.views.currentTab.slottedElements[ELayoutElement.Display]?.slot,
  }));

  const [bars, setBars] = useState<{ bar1: number; bar2: number }>({
    bar1: 0,
    bar2: 0,
  });

  // The minimums change as elements are slotted, so they are keyed on their values
  const minsKey = JSON.stringify(childrenMins);
  const mins = useMemo(() => {
    // Each layout has a maximum of three primary sections
    // and a minimum of two, so restSlots and bar1Slots
    // will always have values
    const [restSlots, bar1Slots, bar2Slots] = vectors;
    const rest = calculateMinimum(restSlots);
    const bar1 = calculateMinimum(bar1Slots);
    let bar2 = 0;
    if (bar2Slots) bar2 = calculateMinimum(bar2Slots);
    return { rest, bar1, bar2 };
  }, [minsKey]);

  const componentEl = useRef<HTMLDivElement | null>(null);

  // The fit is run from effects, listeners and callback refs that outlive a render
  const fitRef = useRef(fit);
  fitRef.current = fit;
  // Window resizes are fit once they end, so the sections scale from their proportions meanwhile
  const debouncedFit = useDebounce(200, () => fitRef.current());

  useEffect(() => {
    onTotalWidth(mapVectors(vectors), isColumns);
    fitRef.current();
  }, [minsKey]);

  // The dock bounds settle after the dock is collapsed or expanded
  useEffect(() => {
    onTotalWidth(mapVectors(vectors), isColumns);
    debouncedFit();
  }, [chatCollapsed]);

  useEffect(() => {
    window.addEventListener('resize', debouncedFit);
    return () => window.removeEventListener('resize', debouncedFit);
  }, []);

  // Callback ref used due to reactivity issues
  const componentRef = useCallback(node => {
    if (node) {
      componentEl.current = node;
      onTotalWidth(mapVectors(vectors), isColumns);
      fitRef.current();
    }
  }, []);

  /**
   * calculates the aggregate minimum value of all components of a given
   * subset or set of layout slots
   */
  function calculateMinimum(slots: ILayoutSlotArray) {
    const mins = mapVectors(slots);
    return LayoutService.views.calculateMinimum(isColumns ? 'x' : 'y', mins);
  }

  /**
   * @returns a map of the ILayoutSlotArray provided with the minimum
   * sizes of components in each slot
   */
  function mapVectors(slots: ILayoutSlotArray): IVec2Array {
    return slots.map(slot => {
      if (Array.isArray(slot)) return mapVectors(slot);
      return minsFromSlot(slot);
    });
  }

  function minsFromSlot(slot: TLayoutSlot) {
    // If there is no component slotted we return no minimum
    if (!childrenMins || !childrenMins[slot]) return { x: 0, y: 0 };
    return childrenMins[slot];
  }

  const setBar = useCallback((bar: 'bar1' | 'bar2', val: number) => {
    if (val === 0 || !componentEl.current) return;
    setBars(oldState => ({ ...oldState, [bar]: val }));
    const { height, width } = componentEl.current.getBoundingClientRect();
    const totalSize = isColumns ? width : height;
    const proportion = parseFloat((val / totalSize).toFixed(2));
    LayoutService.actions.setBarResize(bar, proportion);
    return proportion;
  }, []);

  /**
   * Fits the resizable areas to the size of the layout and the minimums of the elements in them.
   * Because we store resize positions as proportions in state, this also derives the pixel
   * values to render, and only writes the proportions that changed.
   */
  function fit() {
    const el = componentEl.current;
    if (!el || !el.isConnected) return;
    const { height, width } = el.getBoundingClientRect();
    const total = isColumns ? width : height;
    if (!total) return;

    const barNames: ('bar1' | 'bar2')[] = vectors.length > 2 ? ['bar1', 'bar2'] : ['bar1'];
    // Values of 1 or more are pixels, from before sizes were stored as proportions
    const pixels = barNames.map(bar => {
      const value = resizes[bar] as number;
      return value >= 1 ? value : Math.round(total * value);
    });
    const sectionMins = [mins.rest, mins.bar1, mins.bar2];

    const sizes = fitSections(
      total,
      vectors.map((slots, i) => ({
        min: sectionMins[i],
        size: i === 0 ? total - pixels.reduce((a, b) => a + b, 0) : pixels[i - 1],
        hasDisplay: !!displaySlot && flattenSlots(slots).includes(displaySlot),
      })),
    );

    const fitted = { bar1: 0, bar2: 0 };
    barNames.forEach((bar, i) => {
      fitted[bar] = sizes[i + 1];
      const proportion = parseFloat((sizes[i + 1] / total).toFixed(2));
      if (proportion !== resizes[bar]) LayoutService.actions.setBarResize(bar, proportion);
    });
    setBars(fitted);
  }

  /**
   * Calculates the maximum area a bar can expand two given the min
   * constraints of the other resizable area(s)
   */
  const calculateMax = useCallback((restMin: number) => {
    if (!componentEl.current) return 0;
    const { height, width } = componentEl.current.getBoundingClientRect();
    const max = isColumns ? width : height;
    return max - restMin;
  }, []);

  return { componentRef, calculateMax, setBar, mins, bars, resizes };
}
