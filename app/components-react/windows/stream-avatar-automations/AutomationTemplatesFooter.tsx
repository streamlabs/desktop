import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';

interface Props {
  totalSelected: number;
  saving: boolean;
  onCancel: () => void;
  onComplete: () => void;
  cancelLabel?: string;
}

export default function AutomationTemplatesFooter({
  totalSelected,
  saving,
  onCancel,
  onComplete,
  cancelLabel,
}: Props) {
  const addLabel =
    totalSelected === 1
      ? $t('Add %{count} Automation', { count: totalSelected })
      : $t('Add %{count} Automations', { count: totalSelected });

  return (
    <>
      <Button onClick={onCancel} disabled={saving}>
        {cancelLabel ?? $t('Cancel')}
      </Button>
      <Button
        type="primary"
        style={{ marginLeft: '8px' }}
        onClick={onComplete}
        disabled={saving || totalSelected === 0}
      >
        {saving ? $t('Adding...') : addLabel}
      </Button>
    </>
  );
}
