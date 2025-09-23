import { Button } from 'antd';
import React from 'react';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { ObsSettingsSection } from './ObsSettings';
import { $t } from 'services/i18n';
import FormFactory from 'components-react/shared/inputs/FormFactory';

export function NotificationSettings() {
  const { NotificationsService, TroubleshooterService } = Services;

  const { notifValues, notifMeta, troubleValues, troubleMeta } = useVuex(() => ({
    notifValues: NotificationsService.views.settings,
    notifMeta: NotificationsService.views.metadata,
    troubleValues: TroubleshooterService.views.settings,
    troubleMeta: TroubleshooterService.views.metadata,
  }));

  function saveNotifSetting(key: string) {
    return (value: boolean) => {
      NotificationsService.actions.setSettings({ [key]: value });
    };
  }

  function saveTroubleshooterSetting(key: string) {
    return (value: boolean | number) => {
      TroubleshooterService.actions.setSettings({ [key]: value });
    };
  }

  function restoreDefaults() {
    NotificationsService.actions.restoreDefaultSettings();
    TroubleshooterService.actions.restoreDefaultSettings();
  }

  function showNotifications() {
    NotificationsService.actions.showNotifications();
  }

  return (
    <>
      <ObsSettingsSection>
        <div style={{ display: 'flex', justifyContent: 'space-evenly', paddingBottom: '16px' }}>
          <Button type="primary" onClick={showNotifications}>
            {$t('Show Notifications')}
          </Button>
          <Button className="button--soft-warning" onClick={restoreDefaults}>
            {$t('Restore Defaults')}
          </Button>
        </div>
      </ObsSettingsSection>
      <ObsSettingsSection>
        <FormFactory values={notifValues} metadata={notifMeta} onChange={saveNotifSetting} />
      </ObsSettingsSection>
      <ObsSettingsSection title={$t('Troubleshooter Notifications')}>
        <FormFactory
          values={troubleValues}
          metadata={troubleMeta}
          onChange={saveTroubleshooterSetting}
        />
      </ObsSettingsSection>
    </>
  );
}

NotificationSettings.page = 'Notifications';
