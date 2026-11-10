import React from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { $t } from 'services/i18n';
import UltraIcon from 'components-react/shared/UltraIcon';
import { upgrade, ULTRA_PLUS_TIER, AUTOMATION_LIMITS } from './automations-limits';
import styles from './UsageMeter.m.less';

interface UsageMeterProps {
  count: number;
  max: number;
  tier: string;
  /** Wording of the count: automations "used" on the list, "enabled" in the template picker. */
  label?: 'used' | 'enabled';
}

export default function UsageMeter({ count, max, tier, label = 'used' }: UsageMeterProps) {
  const pct = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const atCap = count >= max;
  const atTopTier = tier === ULTRA_PLUS_TIER;

  // The picker (Figma) shows the count in teal. Translate the whole sentence once with a marker
  // in place of the count, then swap the marker for the styled number, so word order follows the
  // locale.
  const COUNT_MARKER = '\u0000';
  const enabledParts = $t('%{count}/%{max} automations enabled', {
    count: COUNT_MARKER,
    max,
  }).split(COUNT_MARKER);

  return (
    <div className={cx(styles.usageMeter, { [styles.usageMeterPicker]: label === 'enabled' })}>
      <div className={styles.usageRow}>
        <span className={styles.usageText}>
          {label === 'enabled'
            ? enabledParts.map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className={styles.usageCount}>{count}</span>}
                  {part}
                </React.Fragment>
              ))
            : $t('%{count}/%{max} automations used', { count, max })}
        </span>
        <Tooltip
          title={$t(
            'Free includes %{free} enabled automations, Ultra %{ultra}, and Ultra+ %{ultraPlus}.',
            {
              free: AUTOMATION_LIMITS.free,
              ultra: AUTOMATION_LIMITS.ultra,
              ultraPlus: AUTOMATION_LIMITS[ULTRA_PLUS_TIER],
            },
          )}
        >
          <i className={`icon-information ${styles.usageInfo}`} />
        </Tooltip>
        <div className={styles.usageTrack}>
          <div className={styles.usageFill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {atCap && !atTopTier && (
        <span className={styles.upgradeLink} onClick={() => upgrade(tier, 'header')}>
          <UltraIcon type="badge" />
          <span className={styles.upgradeText}>
            {tier === 'ultra'
              ? $t('Upgrade to Ultra+ to unlock more')
              : $t('Upgrade to Ultra to unlock more')}
          </span>
        </span>
      )}
      {atCap && atTopTier && (
        <span className={styles.atCapNote}>{$t('Maximum automations reached')}</span>
      )}
    </div>
  );
}
