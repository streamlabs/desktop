import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { SwitchInput } from 'components-react/shared/inputs';
import css from './ReactiveWidgetGameSettings.m.less';

interface ReactiveWidgetGameSettingsProps {
  options: { id: string; name: string; enabled: boolean }[];
  onChangeGroupEnabled: (gameId: string, enabled: boolean) => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
  title?: string;
}

export function ReactiveWidgetGameSettings({
  options,
  onChangeGroupEnabled,
  title,
  onEnableAll,
  onDisableAll,
}: ReactiveWidgetGameSettingsProps) {
  const computedTitle = title || $t('General Game Settings');
  const allOptionsEnabled = options?.every(option => option.enabled);
  const allOptionsDisabled = options?.every(option => !option.enabled);
  if (!options || options.length === 0) {
    return <div>{$t('No triggers available.')}</div>;
  }
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
            style={{ opacity: allOptionsEnabled ? 0.5 : 1 }}
            disabled={allOptionsEnabled}
          >
            {$t('Enable All')}
          </Button>
          <Button
            onClick={onDisableAll}
            className={`${css.triggerButton} ${css.triggerButtonDisabled}`}
            type="text"
            style={{ opacity: allOptionsDisabled ? 0.5 : 1 }}
            disabled={allOptionsDisabled}
          >
            {$t('Disable All')}
          </Button>
        </div>
      </div>
      <ul className={css.list}>
        {options?.map(option => {
          return (
            <li key={option.id} className={css.listRow}>
              <span
                className={`${css.switchText} ${
                  option.enabled ? css.switchEnabled : css.switchDisabled
                }`}
              >
                {option.name}
              </span>
              <div
                className={`${css.row} ${css.switch} ${
                  option.enabled ? css.switchEnabled : css.switchDisabled
                }`}
              >
                <SwitchInput
                  name={`toggle-${option.id}`}
                  value={option.enabled}
                  onChange={value => onChangeGroupEnabled(option.id, value as boolean)}
                  label={option.enabled ? $t('Enabled') : $t('Disabled')}
                  labelAlign="left"
                  layout="horizontal"
                  uncontrolled
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
