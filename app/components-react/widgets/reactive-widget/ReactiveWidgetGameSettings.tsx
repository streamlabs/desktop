import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { SwitchInput } from 'components-react/shared/inputs';
import css from './ReactiveWidgetGameSettings.m.less';

interface ReactiveWidgetGameSettingsProps {
  options: { id: string; name: string; enabled: boolean }[];
  onToggleGame: (gameId: string, enabled: boolean) => void;
  title?: string;
}

export function ReactiveWidgetGameSettings({
  options,
  onToggleGame,
  title,
}: ReactiveWidgetGameSettingsProps) {
  const computedTitle = title || $t('General Game Settings');
  const allOptionsEnabled = options.every(option => option.enabled);
  const allOptionsDisabled = options.every(option => !option.enabled);
  return (
    <div style={{ marginBottom: '18px' }}>
      <h3 style={{ marginBottom: '0', fontSize: '16px', lineHeight: '100%' }}>
        {computedTitle}
      </h3>
      <div className={css.listRow} style={{ padding: '0px 12px 0 16px' }}>
        <span style={{ fontSize: '12px', color: 'var(--link)' }}>{$t('Name')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Button type="text" style={{ padding: '4px', color: 'var(--primary)', opacity: allOptionsEnabled ? 0.5 : 1 }} disabled={allOptionsEnabled}>
            {$t('Enable All')}
          </Button>
          <Button type="text" style={{ padding: '4px', color: 'var(--warning)', opacity: allOptionsDisabled ? 0.5 : 1 }} disabled={allOptionsDisabled}>
            {$t('Disable All')}
          </Button>
        </div>
      </div>
      <ul className={css.list}>
        {options?.map((option) => {
          return (
            <li key={option.id} className={css.listRow}>
              <span
                style={{
                  userSelect: 'none',
                  fontWeight: 500,
                  fontSize: '14px',
                  color: option.enabled ? 'var(--title)' : 'var(--nav-icon-inactive)',
                }}
              >
                {option.name}
              </span>
              <div className={css.row}>
                <SwitchInput
                  name={`toggle-${option.id}`}
                  value={option.enabled}
                  onChange={value => onToggleGame(option.id, value as boolean)}
                  label={option.enabled ? $t('Enabled') : $t('Disabled')}
                  labelAlign="left"
                  layout="horizontal"
                  uncontrolled
                  checkmark
                  style={{
                    marginBottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 500,
                    color: option.enabled ? 'var(--title)' : 'var(--nav-icon-inactive)',
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
