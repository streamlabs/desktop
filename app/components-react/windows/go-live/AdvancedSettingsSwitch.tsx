import React from 'react';
import { useGoLiveSettings } from './useGoLiveSettings';
import { SwitchInput } from '../../shared/inputs';
import { $t } from '../../../services/i18n';

export default function AdvancedSettingsSwitch() {
  const {
    isAdvancedMode,
    canShowAdvancedMode,
    switchAdvancedMode,
    lifecycle,
    isLoading,
  } = useGoLiveSettings();

  const ableToConfirm = ['prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowAdvancedSwitch = ableToConfirm && canShowAdvancedMode;

  return !shouldShowAdvancedSwitch ? null : (
    <SwitchInput
      label={$t('Additional Settings')}
      name="advancedMode"
      onChange={switchAdvancedMode}
      value={isAdvancedMode}
      debounce={200}
      disabled={isLoading}
      labelAlign="left"
      wrapperCol={{ span: 2 }}
      labelCol={{ flex: '95%' }}
      layout="horizontal"
      style={{ marginBottom: '0px' }}
      color="secondary"
      size="default"
    />
  );
}
