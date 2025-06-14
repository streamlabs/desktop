import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { LayoutSlot, IVec2Array } from 'services/layout';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';

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

export interface ILayoutSlotArray extends Array<ILayoutSlotArray | LayoutSlot> {}

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

  const { livedockSize, resizes, chatCollapsed } = useVuex(() => ({
    livedockSize: CustomizationService.state.livedockSize,
    resizes: LayoutService.views.currentTab.resizes,
    chatCollapsed: CustomizationService.state.livedockCollapsed,
  }));

  const [bars, setBars] = useState<{ bar1: number; bar2: number }>({
    bar1: 0,
    bar2: 0,
  });

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
  }, []);

  useEffect(() => {
    onTotalWidth(mapVectors(vectors), isColumns);
    updateSize();
    window.addEventListener('resize', () => updateSize());

    return () => {
      window.removeEventListener('resize', () => updateSize());
    };
  }, [chatCollapsed]);

  const componentEl = useRef<HTMLDivElement | null>(null);

  // Callback ref used due to reactivity issues
  const componentRef = useCallback(node => {
    if (node) {
      componentEl.current = node;
      onTotalWidth(mapVectors(vectors), isColumns);
      updateSize();
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

  function minsFromSlot(slot: LayoutSlot) {
    // If there is no component slotted we return no minimum
    if (!childrenMins || !childrenMins[slot]) return { x: 0, y: 0 };
    return childrenMins[slot];
  }

  /**
   * Because we store resize positions as proportions in state,
   * we need to derive pixel values to render based on the size
   * of the current window
   */
  const getBarPixels = useCallback((bar: 'bar1' | 'bar2', offset: number) => {
    if (!componentEl.current) return;
    // Migrate from pixels to proportions
    const migratedResize =
      (resizes[bar] as number) >= 1 ? setBar(bar, resizes[bar] as number) : resizes[bar];
    const { height, width } = componentEl.current.getBoundingClientRect();
    const offsetSize = isColumns ? width - offset : height;
    return Math.round(offsetSize * (migratedResize as number));
  }, []);

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
   * Updates the total proportions of the resizable areas as a result of
   * non-resize actions such as window resizing or expanding chat
   */
  const updateSize = useCallback((chatCollapsed = true, oldChatCollapsed?: boolean) => {
    let offset = chatCollapsed ? 0 : livedockSize;
    // Reverse offset if chat is collapsed from an uncollapsed state
    if (chatCollapsed && oldChatCollapsed === false) {
      offset = livedockSize * -1;
    }
    const bar1 = getBarPixels('bar1', offset);
    if (bar1) setBar('bar1', bar1);
    if (mins.bar2) {
      const bar2 = getBarPixels('bar2', offset);
      if (bar2) setBar('bar2', bar2);
    }
  }, []);

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
