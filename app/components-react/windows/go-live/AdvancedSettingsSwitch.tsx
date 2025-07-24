import React from 'react';
import { useGoLiveSettings } from './useGoLiveSettings';
import { SwitchInput } from '../../shared/inputs';
import { $t } from '../../../services/i18n';
import { Form } from 'antd';

export default function AdvancedSettingsSwitch() {
  const {
    isAdvancedMode,
    switchAdvancedMode,
    lifecycle,
    isMultiplatformMode,
    isDualOutputMode,
    isLoading,
  } = useGoLiveSettings();

  const ableToConfirm = ['prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowAdvancedSwitch = ableToConfirm && (isMultiplatformMode || isDualOutputMode);

  return !shouldShowAdvancedSwitch ? null : (
    <SwitchInput
      label={$t('Additional Settings')}
      name="advancedMode"
      onChange={switchAdvancedMode}
      value={isAdvancedMode}
      debounce={200}
      disabled={isLoading}
      labelAlign="right"
      wrapperCol={{ span: 1 }}
      labelCol={{ flex: '95%' }}
    />
  );
}
