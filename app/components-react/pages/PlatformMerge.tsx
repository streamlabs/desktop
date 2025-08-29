import React, { useState } from 'react';
import { EAuthProcessState } from 'services/user';
import { $t } from 'services/i18n';
import {
  EPlatformCallResult,
  externalAuthPlatforms,
  getPlatformService,
  TPlatform,
} from '../../services/platforms';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { alertAsync } from 'components-react/modals';

interface IPlatformMergeProps {
  params: {
    platform?: TPlatform;
    overlayUrl?: string;
    overlayName?: string;
    highlighter?: boolean;
  };
  className?: string;
}

export default function PlatformMerge(p: IPlatformMergeProps) {
  const {
    UserService,
    NavigationService,
    StreamSettingsService,
    SceneCollectionsService,
    WindowsService,
  } = Services;

  const [showOverlay, setShowOverlay] = useState(false);

  const platform = p.params?.platform;

  if (!platform) throw new Error('Platform should be provided for PlatformMerge');

  const { loading, authInProgress, platformName } = useVuex(() => ({
    loading: UserService.state.authProcessState === EAuthProcessState.Loading,
    authInProgress: UserService.state.authProcessState === EAuthProcessState.InProgress,
    platformName: getPlatformService(platform).displayName,
  }));

  async function mergePlatform() {
    if (!platform) return;
    const mode = externalAuthPlatforms.includes(platform) ? 'external' : 'internal';
    await UserService.actions.return
      .startAuth(platform, mode, true)
      .then(res => {
        if (res === EPlatformCallResult.Error) {
          WindowsService.actions.setWindowOnTop();
          alertAsync(
            $t(
              'This account is already linked to another Streamlabs Account. Please use a different account.',
            ),
          ).then(() => {
            NavigationService.actions.navigate('Studio');
          });
          return;
        }

        if (p.params.highlighter) {
          NavigationService.actions.navigate('Highlighter');
          return;
        }

        StreamSettingsService.actions.setSettings({ protectedModeEnabled: true });

        if (p.params.overlayUrl) {
          setShowOverlay(true);
        } else {
          NavigationService.actions.navigate('Studio');
        }
      })
      .catch(e => {
        NavigationService.actions.navigate('Studio');
        WindowsService.actions.setWindowOnTop();
      });
  }

  async function installOverlay() {
    if (p.params.overlayUrl && p.params.overlayName) {
      await SceneCollectionsService.actions.return.installOverlay(
        p.params.overlayUrl,
        p.params.overlayName,
      );
    }

    NavigationService.actions.navigate('Studio');
  }

  function LoginStep() {
    return (
      <>
        {$t('Connect %{platformName} to Streamlabs.', { platformName })}
        <br />
        {$t('All of your scenes, sources, and settings will be preserved.')}
        <button
          style={{ marginTop: '24px' }}
          className={`button button--${platform}`}
          disabled={loading}
          onClick={mergePlatform}
        >
          {loading && <i className="fas fa-spinner fa-spin" />}
          {$t('Connect')}
        </button>
      </>
    );
  }

  function OverlayStep() {
    return (
      <>
        <b>{$t('Step 3:')}</b> {$t('Install Your Theme')}
        <br />
        <button
          style={{ marginTop: '24px' }}
          className="button button--action"
          disabled={loading || authInProgress}
          onClick={installOverlay}
        >
          <i className={loading ? 'fas fa-spinner fa-spin' : 'icon-themes'} />
          {$t('Install %{overlayName}', { overlayName: p.params.overlayName })}
        </button>
      </>
    );
  }

  return (
    <div
      className={p.className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
    >
      <div style={{ width: '400px' }}>
        <h1>{$t('Connect %{platformName}', { platformName })}</h1>
        {showOverlay ? <OverlayStep /> : <LoginStep />}
      </div>
    </div>
  );
}
