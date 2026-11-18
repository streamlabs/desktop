import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import styles from './AutomationTemplates.m.less';

interface Props {
  totalSelected: number;
  saving: boolean;
  onCancel: () => void;
  /** Finishing with nothing selected is up to the caller (the picker treats it as skipping). */
  onComplete: () => void;
  cancelLabel?: string;
  /** Set in a pack's detail view to show "Back" on the left. */
  onBack?: () => void;
}

export default function AutomationTemplatesFooter({
  totalSelected,
  saving,
  onCancel,
  onComplete,
  cancelLabel,
  onBack,
}: Props) {
  let finishLabel = $t('Finish');
  if (saving) finishLabel = $t('Adding...');
  else if (totalSelected > 0) finishLabel = $t('Finish (%{count} Added)', { count: totalSelected });

  return (
    <div className={styles.footer}>
      {onBack && (
        <Button onClick={onBack} disabled={saving}>
          {$t('Back')}
        </Button>
      )}
      <div className={styles.footerActions}>
        <Button onClick={onCancel} disabled={saving}>
          {cancelLabel ?? $t('Cancel')}
        </Button>
        <Button type="primary" onClick={onComplete} disabled={saving}>
          {finishLabel}
        </Button>
      </div>
    </div>
  );
}
