import React from 'react';
import { Button } from 'antd';
import { ObsSettingsSection } from './ObsSettings';
import { Services } from '../../service-provider';
import { alertAsync } from '../../modals';
import { $t } from 'services/i18n/index';

export function ExperimentalSettings() {
  const { ScenesService, WindowsService } = Services;

  function repairSceneCollection() {
    ScenesService.repair();
    alertAsync('Repair finished. See details in the log file');
  }

  function showDemoComponents() {
    WindowsService.actions.showWindow({
      title: 'Shared React Components',
      componentName: 'SharedComponentsLibrary',
      size: { width: 1000, height: 1000 },
    });
  }

  return (
    <ObsSettingsSection>
      <div className="section">
        <h2>{$t('Repair Scene Collection')}</h2>
        <Button onClick={repairSceneCollection}>Repair Scene Collection</Button>
      </div>
      <div className="section">
        <h2>{$t('Show Components Library')}</h2>
        <Button type="primary" onClick={showDemoComponents}>
          Show Shared Components Library
        </Button>
      </div>
    </ObsSettingsSection>
  );
}
