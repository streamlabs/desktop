import React, { useState } from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { $t } from 'services/i18n';
import type { AutomationTemplatePack } from 'services/stream-avatar/stream-avatar-api-service';
import TemplatePreview from './TemplatePreview';
import { templateChipLabel } from './automations-utils';
import styles from './AutomationTemplates.m.less';

const VISIBLE_CHIPS = 2;

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
  const hiddenChips = chips.slice(VISIBLE_CHIPS);
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
          />
        </div>

        <div className={styles.cardBody}>
          <div className={styles.cardTitle} title={pack.name}>
            {pack.name}
          </div>
          <div className={styles.chips}>
            {chips.slice(0, VISIBLE_CHIPS).map((chip, i) => (
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
