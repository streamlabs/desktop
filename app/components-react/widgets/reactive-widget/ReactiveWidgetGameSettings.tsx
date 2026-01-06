import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { SwitchInput } from 'components-react/shared/inputs';
import css from './ReactiveWidgetGameSettings.m.less';
import { IReactiveGroupOption } from './ReactiveWidget.helpers';

interface ReactiveWidgetGameSettingsProps {
  scopes: IReactiveGroupOption[] | null | undefined;
  onToggleScope: (gameId: string, enabled: boolean) => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
  title?: string;
}

export function ReactiveWidgetGameSettings({
  scopes,
  onToggleScope,
  title,
  onEnableAll,
  onDisableAll,
}: ReactiveWidgetGameSettingsProps) {
  if (!scopes || scopes.length === 0) {
    return <div>{$t('No triggers available.')}</div>;
  }

  const computedTitle = title || $t('General Game Settings');
  const allEnabled = scopes.every(s => s.enabled);
  const allDisabled = scopes.every(s => !s.enabled);
  
  return (
    <div className={css.containerGameSettings}>
      <h3 className={css.title}>{computedTitle}</h3>
      <div className={css.listRow}>
        <span className={css.listHeading}>{$t('Name')}</span>
        <div className={css.triggerButtonRow}>
          <Button
            onClick={onEnableAll}
            className={`${css.triggerButton} ${css.triggerButtonEnabled}`}
            type="text"
            style={{ opacity: allEnabled ? 0.5 : 1 }}
            disabled={allEnabled}
          >
            {$t('Enable All')}
          </Button>
          <Button
            onClick={onDisableAll}
            className={`${css.triggerButton} ${css.triggerButtonDisabled}`}
            type="text"
            style={{ opacity: allDisabled ? 0.5 : 1 }}
            disabled={allDisabled}
          >
            {$t('Disable All')}
          </Button>
        </div>
      </div>
      <ul className={css.list}>
        {scopes.map(scope => {
        const statusClass = scope.enabled ? css.switchEnabled : css.switchDisabled;
          return (
            <li key={scope.id} className={css.listRow}>
              <span
                className={`${css.switchText} ${statusClass}`}
              >
                {scope.name}
              </span>
              <div
                className={`${css.row} ${css.switch} ${statusClass}`}
              >
                <SwitchInput
                  name={`toggle-${scope.id}`}
                  value={scope.enabled}
                  onChange={value => onToggleScope(scope.id, value as boolean)}
                  label={scope.enabled ? $t('Enabled') : $t('Disabled')}
                  labelAlign="left"
                  layout="horizontal"
                  checkmark
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
