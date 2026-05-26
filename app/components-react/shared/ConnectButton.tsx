import { Button } from 'antd';
import React, { useCallback } from 'react';
import { $t } from 'services/i18n';
import { EPlatformCallResult, externalAuthPlatforms, TPlatform } from 'services/platforms';
import styles from './ConnectButton.m.less';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { alertAsync } from 'components-react/modals';
import { EAuthProcessState } from 'services/user';
import { useVuex } from 'components-react/hooks';

interface IConnectButtonProps {
  platform: TPlatform;
  className?: string;
  onClick?: () => void;
}

export default function ConnectButton(p: IConnectButtonProps) {
  const { UserService, InstagramService, WindowsService, StreamSettingsService } = Services;

  const { isLoading, authInProgress } = useVuex(() => ({
    isLoading: UserService.state.authProcessState === EAuthProcessState.Loading,
    authInProgress: UserService.state.authProcessState === EAuthProcessState.InProgress,
    instagramSettings: InstagramService.state.settings,
  }));

  const platformMergeInline = useCallback(async (platform: TPlatform) => {
    const mode = externalAuthPlatforms.includes(platform) ? 'external' : 'internal';

    await UserService.actions.return.startAuth(platform, mode, true).then(res => {
      WindowsService.actions.setWindowOnTop('child');
      if (res === EPlatformCallResult.Error) {
        alertAsync(
          $t(
            'This account is already linked to another Streamlabs Account. Please use a different account.',
          ),
        );
        return;
      }

      StreamSettingsService.actions.setSettings({ protectedModeEnabled: true });
    });
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      if (p.platform === 'instagram') {
        UserService.actions.return.startAuth('instagram', 'internal', true);
      } else {
        platformMergeInline(p.platform);
      }
    },
    [p.platform, platformMergeInline],
  );

  return (
    <Button
      onClick={handleClick}
      className={cx(p?.className, { [styles.tiktokConnectBtn]: p.platform === 'tiktok' })}
      disabled={isLoading || authInProgress}
      style={{
        backgroundColor: `var(--${p.platform})`,
        borderColor: 'transparent',
        color: ['trovo', 'instagram', 'kick', 'patreon'].includes(p.platform) ? 'black' : 'inherit',
      }}
    >
      {$t('Connect')}
    </Button>
  );
}
