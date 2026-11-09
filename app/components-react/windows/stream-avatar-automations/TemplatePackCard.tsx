import React, { useLayoutEffect, useRef, useState } from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { $t } from 'services/i18n';
import type { AutomationTemplatePack } from 'services/stream-avatar/stream-avatar-api-service';
import TemplatePreview from './TemplatePreview';
import { templateChipLabel } from './automations-utils';
import styles from './AutomationTemplates.m.less';

// Matches `.chips { gap }` in AutomationTemplates.m.less.
const CHIP_GAP = 8;

/**
 * How many leading chips fit in `available` px, leaving room for a "+N" chip when some are left
 * over. Always at least one, which then shortens with an ellipsis.
 */
function fittingChips(widths: number[], moreWidth: number, available: number): number {
  let used = 0;
  for (let i = 0; i < widths.length; i++) {
    used += (i > 0 ? CHIP_GAP : 0) + widths[i];
    const rest = widths.length - (i + 1);
    const needed = used + (rest > 0 ? CHIP_GAP + moreWidth : 0);
    if (needed > available) return Math.max(1, i);
  }
  return widths.length;
}

interface Props {
  pack: AutomationTemplatePack;
  /** Templates in the pack that work with the user's linked platforms. */
  availableCount: number;
  /** Of those, how many are added. */
  selectedCount: number;
  onOpen: () => void;
  onToggleAll: () => void;
}

export default function TemplatePackCard({
  pack,
  availableCount,
  selectedCount,
  onOpen,
  onToggleAll,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const unavailable = availableCount === 0;
  const chips = pack.templates.map(templateChipLabel);
  const chipsKey = chips.join('|');

  // Chip labels vary in length, so measure them: show the ones that fit whole and fold the rest
  // into "+N", which always stays visible. The card has a fixed width, so measuring once per
  // label set is enough.
  const chipsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleChips, setVisibleChips] = useState(chips.length);
  useLayoutEffect(() => {
    const row = chipsRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const widths = Array.from(measure.children).map(el => (el as HTMLElement).offsetWidth);
    const moreWidth = widths.pop() ?? 0;
    setVisibleChips(fittingChips(widths, moreWidth, row.clientWidth));
  }, [chipsKey]);
  const hiddenChips = chips.slice(visibleChips);
  const allAdded = !unavailable && selectedCount >= availableCount;
  const partlyAdded = selectedCount > 0 && !allAdded;

  let addLabel = $t('Add All (%{count})', {
    count: unavailable ? pack.templates.length : availableCount,
  });
  if (allAdded) addLabel = $t('Added');
  else if (partlyAdded) {
    addLabel = $t('%{count} of %{total} added', {
      count: selectedCount,
      total: availableCount,
    });
  }

  return (
    <Tooltip title={unavailable ? $t('Link a platform to use this') : undefined}>
      <div
        className={cx(styles.card, { [styles.cardUnavailable]: unavailable })}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={unavailable ? undefined : onOpen}
      >
        <div className={styles.cardThumb}>
          <TemplatePreview
            src={hovered && !unavailable ? pack.gifUrl : pack.imageUrl}
            className={styles.cardMedia}
            // Some packs' imageUrl is itself a video; only play on hover.
            playing={hovered && !unavailable}
          />
        </div>

        <div className={styles.cardBody}>
          <div className={styles.cardTitle} title={pack.name}>
            {pack.name}
          </div>
          <div className={styles.chips} ref={chipsRef}>
            {/* Off-screen copy of every chip plus a worst-case "+N", used only for measuring. */}
            <div className={styles.chipsMeasure} ref={measureRef} aria-hidden>
              {chips.map((chip, i) => (
                <span key={i} className={styles.chip}>
                  {chip}
                </span>
              ))}
              <span className={cx(styles.chip, styles.chipMore)}>+{chips.length}</span>
            </div>
            {chips.slice(0, visibleChips).map((chip, i) => (
              <span key={i} className={styles.chip} title={chip}>
                {chip}
              </span>
            ))}
            {hiddenChips.length > 0 && (
              <span className={cx(styles.chip, styles.chipMore)} title={hiddenChips.join(', ')}>
                +{hiddenChips.length}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className={cx(styles.cardAdd, { [styles.cardAddDone]: allAdded })}
          // Not `disabled`: a disabled button swallows the hover that shows the card's tooltip.
          aria-disabled={unavailable}
          onClick={e => {
            e.stopPropagation();
            if (!unavailable) onToggleAll();
          }}
        >
          <i className={allAdded ? 'icon-check-mark' : 'icon-add-circle'} />
          <span>{addLabel}</span>
        </button>
      </div>
    </Tooltip>
  );
}
