/**
 * The smallest size, in px, that the section holding the Display is given.
 */
export const DISPLAY_MIN_PX = 300;

export interface IFitSection {
  /** The size the section can't be made smaller than without hiding its elements. */
  min: number;
  /** The current size. */
  size: number;
  hasDisplay: boolean;
}

/**
 * Fits the sections of a layout to the available space along the axis they are resized on.
 * The first section is the one that has no resize bar and takes what the others leave.
 * The section holding the Display keeps a fixed floor, and when the minimums of all sections
 * can't fit, the other sections shrink in proportion to their minimums.
 * @returns the new size of each section
 */
export function fitSections(total: number, sections: IFitSection[]): number[] {
  const mins = sections.map(s =>
    s.hasDisplay ? Math.min(Math.max(s.min, DISPLAY_MIN_PX), total) : s.min,
  );
  const minsTotal = mins.reduce((a, b) => a + b, 0);

  if (minsTotal > total) return shrinkToFit(total, sections);

  const [, ...bars] = sections;
  const barMins = mins.slice(1);
  const sizes = bars.map((bar, i) => {
    const maxSize = total - (minsTotal - barMins[i]);
    return Math.min(Math.max(bar.size, barMins[i]), maxSize);
  });

  // The rest section takes what is left, and the bars give up space until it has its minimum
  const rest = total - sizes.reduce((a, b) => a + b, 0);
  const deficit = mins[0] - rest;
  if (deficit > 0) {
    const slack = sizes.map((size, i) => size - barMins[i]);
    const slackTotal = slack.reduce((a, b) => a + b, 0);
    sizes.forEach((size, i) => {
      sizes[i] = size - (slackTotal ? (deficit * slack[i]) / slackTotal : 0);
    });
  }

  const rounded = sizes.map(Math.round);
  return [total - rounded.reduce((a, b) => a + b, 0), ...rounded];
}

/**
 * Used when the minimums don't fit: the Display section gets its floor and the rest of the
 * space is split in proportion to the minimums of the other sections.
 */
function shrinkToFit(total: number, sections: IFitSection[]): number[] {
  const displayIndex = sections.findIndex(s => s.hasDisplay);
  const sizes = sections.map(() => 0);
  let remaining = total;

  if (displayIndex >= 0) {
    sizes[displayIndex] = Math.min(DISPLAY_MIN_PX, total);
    remaining -= sizes[displayIndex];
  }

  const others = sections.map((_, i) => i).filter(i => i !== displayIndex);
  const othersMin = others.reduce((sum, i) => sum + sections[i].min, 0);
  others.forEach(i => {
    const share = othersMin ? sections[i].min / othersMin : 1 / others.length;
    sizes[i] = Math.round(remaining * share);
  });

  // Rounding goes to the section without a bar
  const sum = sizes.reduce((a, b) => a + b, 0);
  sizes[0] += total - sum;
  return sizes;
}
