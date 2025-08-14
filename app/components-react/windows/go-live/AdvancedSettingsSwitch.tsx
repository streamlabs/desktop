import React from 'react';
import { useGoLiveSettings } from './useGoLiveSettings';
import { SwitchInput } from '../../shared/inputs';
import { $t } from '../../../services/i18n';
import styles from './GoLive.m.less';

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
      labelAlign="left"
      wrapperCol={{ span: 2 }}
      labelCol={{ flex: '95%' }}
      layout="horizontal"
      style={{ marginBottom: '0px' }}
      className={styles.advancedSettingsSwitch}
    />
  );
}
