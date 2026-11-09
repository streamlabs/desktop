import React from 'react';
import { Tooltip } from 'antd';
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

  return (
    <div className={styles.usageMeter}>
      <div className={styles.usageRow}>
        <span className={styles.usageText}>
          {label === 'enabled'
            ? $t('%{count}/%{max} automations enabled', { count, max })
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
