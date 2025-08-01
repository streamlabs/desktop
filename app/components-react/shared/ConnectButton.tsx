import { Button } from 'antd';
import React from 'react';
import { $t } from 'services/i18n';
import { EPlatformCallResult, externalAuthPlatforms, TPlatform } from 'services/platforms';
import styles from './ConnectButton.m.less';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { alertAsync } from 'components-react/modals';
import { EAuthProcessState } from 'services/user';
import { useVuex } from 'components-react/hooks';

export default function ConnectButton(p: { platform: TPlatform; className?: string }) {
  const { UserService, InstagramService } = Services;

  const { isLoading, authInProgress } = useVuex(() => ({
    isLoading: UserService.state.authProcessState === EAuthProcessState.Loading,
    authInProgress: UserService.state.authProcessState === EAuthProcessState.InProgress,
    instagramSettings: InstagramService.state.settings,
  }));

  async function platformMergeInline(platform: TPlatform) {
    const mode = externalAuthPlatforms.includes(platform) ? 'external' : 'internal';

    await Services.UserService.actions.return.startAuth(platform, mode, true).then(res => {
      Services.WindowsService.actions.setWindowOnTop('child');
      if (res === EPlatformCallResult.Error) {
        alertAsync(
          $t(
            'This account is already linked to another Streamlabs Account. Please use a different account.',
          ),
        );
        return;
      }

      Services.StreamSettingsService.actions.setSettings({ protectedModeEnabled: true });
    });
  }

  async function instagramConnect() {
    await UserService.actions.return.startAuth('instagram', 'internal', true);
  }

  return (
    <Button
      onClick={e => {
        e.stopPropagation();
        if (p.platform === 'instagram') {
          instagramConnect();
        } else {
          platformMergeInline(p.platform);
        }
      }}
      className={cx(p?.className, { [styles.tiktokConnectBtn]: p.platform === 'tiktok' })}
      disabled={isLoading || authInProgress}
      style={{
        backgroundColor: `var(--${p.platform})`,
        borderColor: 'transparent',
        color: ['trovo', 'instagram', 'kick'].includes(p.platform) ? 'black' : 'inherit',
      }}
    >
      {$t('Connect')}
    </Button>
  );
}
