import React from 'react';
import { $t } from 'services/i18n';
import { SwitchInput } from 'components-react/shared/inputs';
import styles from './ReactiveWidgetGameSettings.m.less';

interface ReactiveWidgetGameSettingsProps {
  options: { id: string; label: string; enabled: boolean }[];
  onToggleGame: (gameId: string, enabled: boolean) => void;
}

export function ReactiveWidgetGameSettings({
  options,
  onToggleGame,
}: ReactiveWidgetGameSettingsProps) {
  return (
    <div>
      <h3 style={{ marginBottom: '16px' }}>{$t('General Game Settings')}</h3>
      {options?.map((option, index) => {
        const toggle = () => onToggleGame(option.id, !option.enabled);

        return (
          <div
            key={option.id}
            onClick={toggle}
            role="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '8px',
              cursor: 'pointer',
              backgroundColor: index % 2 === 0 ? 'var(--section-alt)' : '',
              borderRadius: '4px',
            }}
          >
            <span style={{ cursor: 'pointer', userSelect: 'none' }}>
              {option.label}
            </span>
            <div className={styles.row} onClick={e => e.stopPropagation()}>
              <SwitchInput
                value={option.enabled}
                onChange={value => onToggleGame(option.id, value as boolean)}
                label={option.enabled ? $t('Enabled') : $t('Disabled')}
                labelAlign="left"
                layout="horizontal"
                uncontrolled
                checkmark
                style={{ marginBottom: 0, display: 'flex', alignItems: 'center' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
