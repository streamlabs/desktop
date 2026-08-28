import { useModule } from 'slap';
import { Services } from 'components-react/service-provider';
import React, { useEffect, useState } from 'react';
import { $t } from 'services/i18n';
import commonStyles from './Common.m.less';
import { OnboardingModule } from './Onboarding';

export function MacPermissions() {
  const { MacPermissionsService } = Services;
  const { next } = useModule(OnboardingModule);
  const [permissions, setPermissions] = useState(() =>
    MacPermissionsService.getPermissionsStatus(),
  );

  useEffect(() => {
    const sub = MacPermissionsService.permissionsUpdated.subscribe(perms => {
      setPermissions(perms);
    });

    MacPermissionsService.requestPermissions();

    return () => sub.unsubscribe();
  }, []);

  return (
    <div style={{ width: '650px', margin: '100px auto' }}>
      <h1 className={commonStyles.titleContainer}>{$t('Grant Permissions')}</h1>
      <div>
        {$t(
          'Streamlabs needs additional permissions. Grant permissions in the pop-up dialogs to continue.',
        )}
      </div>
      <div style={{ fontSize: '16px', marginTop: '16px' }}>
        <div>
          {$t('Microphone')}
          {permissions.micPermission && (
            <i className="fa fa-check" style={{ marginLeft: '8px', color: '#80F5D2' }} />
          )}
        </div>
        <div>
          {$t('Webcam')}
          {permissions.webcamPermission && (
            <i className="fa fa-check" style={{ marginLeft: '8px', color: '#80F5D2' }} />
          )}
        </div>
      </div>
      <button
        className="button button--action"
        style={{ float: 'right' }}
        onClick={() => next()}
        disabled={!permissions.webcamPermission || !permissions.micPermission}
      >
        {$t('Continue')}
      </button>
    </div>
  );
}
