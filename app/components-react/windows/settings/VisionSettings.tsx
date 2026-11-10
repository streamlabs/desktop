import * as remote from '@electron/remote';
import { Button, message, Progress, Select, Switch } from 'antd';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import {
  useVisionFeatureToggles,
  VisionFeature,
  VisionFeatureToggles,
} from 'components-react/hooks/useVisionFeatureToggles';
import { confirmAsync } from 'components-react/modals';
import { Services } from 'components-react/service-provider';
import React, { useEffect, useMemo, useState } from 'react';
import { $t } from 'services/i18n/index';
import { VisionProcess, VisionService, VisionState } from 'services/vision';
import { ObsSettingsSection } from './ObsSettings';
import styles from './VisionSettings.m.less';
import { AutomationsAnalytics } from 'components-react/windows/stream-avatar-automations/automations-analytics';

type VisionStatus = 'running' | 'starting' | 'updating' | 'stopped';

function getStatusText(state: VisionState): VisionStatus {
  if (state.isRunning) return 'running';
  if (state.isCurrentlyUpdating) return 'updating';
  if (state.isStarting) return 'starting';
  return 'stopped';
}

function buildLocalUrl(port?: number, path: string = ''): string | undefined {
  if (!port || port <= 0) return undefined;
  return `http://localhost:${port}${path}`;
}

function VisionInstalling(props: { percent: number; isUpdate: boolean }) {
  const message = props.isUpdate ? 'Updating...' : 'Installing...';

  return (
    <ObsSettingsSection title={message}>
      <div style={{ marginBottom: 16 }}>
        <Progress
          percent={props.percent * 100}
          status="active"
          format={percent => `${(percent || 0).toFixed(0)}%`}
        />
      </div>
    </ObsSettingsSection>
  );
}

function VisionOption(props: {
  title: string;
  description: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cx(styles.optionRow, { [styles.optionRowHighlight]: props.highlight })}>
      <div className={styles.optionText}>
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      <div className={styles.optionInput}>{props.children}</div>
    </div>
  );
}

type VisionInfoProps = {
  isLoggedIn: boolean;
  status: VisionStatus;
  enabled: boolean;
  installedVersion: string;
  pid?: number;
  port?: number;
  availableProcesses: VisionProcess[];
  activeProcessId: number;
  availableGames: Dictionary<string>;
  selectedGame: string;
  requestAvailableProcesses: VisionService['actions']['requestAvailableProcesses'];
  activateProcess: VisionService['actions']['activateProcess'];
  uninstall: VisionService['actions']['return']['uninstall'];
  openExternal: (url: string) => void;
};

function VisionGeneralSettings({
  isLoggedIn,
  status,
  enabled,
  activeProcessId,
  activateProcess,
  availableGames,
  selectedGame,
  toggles,
  setFeature,
}: Pick<
  VisionInfoProps,
  | 'isLoggedIn'
  | 'status'
  | 'enabled'
  | 'activeProcessId'
  | 'activateProcess'
  | 'availableGames'
  | 'selectedGame'
> & {
  toggles: VisionFeatureToggles;
  setFeature: (feature: VisionFeature, checked: boolean) => void;
}) {
  return (
    <ObsSettingsSection title={$t('Settings')}>
      <VisionOption
        highlight
        title={$t('Selected Game')}
        description={$t(
          'The selected game will be applied to all AI-powered features. You can update your game anytime.',
        )}
      >
        <Select
          style={{ minWidth: 240 }}
          disabled={!isLoggedIn || !enabled || status !== 'running'}
          value={selectedGame}
          onChange={val => activateProcess(activeProcessId, val)}
        >
          {Object.entries(availableGames).map(([key, label]) => (
            <Select.Option key={key} value={key}>
              {label}
            </Select.Option>
          ))}
        </Select>
      </VisionOption>

      <VisionOption
        title={$t('Automations')}
        description={$t(
          'Trigger sources, switch scenes, show instant replays and beyond triggered by game play events.',
        )}
      >
        <Switch
          size="small"
          aria-label={$t('Automations')}
          checked={toggles.automations}
          disabled={!isLoggedIn}
          onChange={checked => setFeature('automations', checked)}
        />
      </VisionOption>

      <VisionOption
        title={$t('Reactive Overlays')}
        description={$t(
          'Dynamic overlays powered by Streamlabs Vision that react in real-time to gameplay events.',
        )}
      >
        <Switch
          size="small"
          aria-label={$t('Reactive Overlays')}
          checked={toggles.reactiveOverlays}
          disabled={!isLoggedIn}
          onChange={checked => setFeature('reactiveOverlays', checked)}
        />
      </VisionOption>

      <VisionOption
        title={$t('Game Pulse Widget')}
        description={$t(
          'Excite your viewers with effects for your in game kills, wins, deaths and more.',
        )}
      >
        <Switch
          size="small"
          aria-label={$t('Game Pulse Widget')}
          checked={toggles.gamePulse}
          disabled={!isLoggedIn}
          onChange={checked => setFeature('gamePulse', checked)}
        />
      </VisionOption>

      <VisionOption
        title={$t('Sidekick')}
        description={$t('Sidekick is a virtual co-host, live producer, and technical assistant.')}
      >
        <Switch
          size="small"
          aria-label={$t('Sidekick')}
          checked={toggles.sidekick}
          disabled={!isLoggedIn}
          onChange={checked => setFeature('sidekick', checked)}
        />
      </VisionOption>
    </ObsSettingsSection>
  );
}

function VisionDebugSection({
  isLoggedIn,
  status,
  enabled,
  installedVersion,
  pid,
  port,
  openExternal,
  activeProcessId,
  availableProcesses,
  requestAvailableProcesses,
  activateProcess,
  uninstall,
  selectedGame,
  allFeaturesOff,
}: Omit<VisionInfoProps, 'availableGames'> & { allFeaturesOff: boolean }) {
  const eventsUrl = useMemo(() => buildLocalUrl(port, '/events'), [port]);
  const frameUrl = useMemo(() => buildLocalUrl(port, '/display_frame'), [port]);
  const isRunning = status === 'running';

  const [isUninstalling, setIsUninstalling] = useState(false);

  async function confirmUninstall() {
    const confirmed = await confirmAsync({
      title: $t('Uninstall Vision?'),
      content: <p>{$t('This will turn off Vision and delete its installed files.')}</p>,
      okText: $t('Uninstall'),
      okButtonProps: { danger: true },
    });
    if (!confirmed) return;

    setIsUninstalling(true);
    try {
      await uninstall();
    } catch (e: unknown) {
      message.error($t('Failed to uninstall Vision.'));
    } finally {
      setIsUninstalling(false);
    }
  }

  return (
    <ObsSettingsSection title={$t('Debugging')}>
      <div>
        {$t('Installed')}: {installedVersion ? `${$t('Yes')} (${installedVersion})` : $t('No')}
      </div>
      <div>
        {$t('PID')}: {pid || ''}
      </div>
      <div>
        {$t('Port')}: {port || ''}
      </div>

      {installedVersion && (
        <div className={styles.inlineField}>
          <div>{$t('Active Process')}:</div>
          <Select
            style={{ minWidth: 240 }}
            disabled={!isLoggedIn || !enabled || !isRunning}
            value={isRunning ? activeProcessId : undefined}
            onFocus={() => isRunning && requestAvailableProcesses()}
            onChange={val => activateProcess(val, selectedGame)}
          >
            {isRunning &&
              availableProcesses?.map(p => (
                <Select.Option key={p.pid} value={p.pid}>
                  {p.title || p.executable_name}
                </Select.Option>
              ))}
          </Select>
        </div>
      )}

      <div className={styles.debugActions}>
        <button
          className="button"
          disabled={!isRunning || !eventsUrl}
          onClick={() => eventsUrl && openExternal(eventsUrl)}
        >
          {$t('Open Events Log')}
        </button>
        <button
          className="button"
          disabled={!isRunning || !frameUrl}
          onClick={() => frameUrl && openExternal(frameUrl)}
        >
          {$t('Open Display Frame')}
        </button>
      </div>

      {installedVersion && allFeaturesOff && (
        <div className={styles.debugActions}>
          <button
            className="button button--warn"
            disabled={isUninstalling}
            onClick={confirmUninstall}
          >
            {$t('Uninstall Vision')}
          </button>
        </div>
      )}
    </ObsSettingsSection>
  );
}

function openLink(url: string) {
  remote.shell.openExternal(url);
}

export function VisionSettings() {
  const { UsageStatisticsService, UserService, VisionService } = Services;
  const actions = VisionService.actions;
  const state = useRealmObject(VisionService.state);
  const isLoggedIn = useVuex(() => UserService.views.isLoggedIn);

  const visionEnabledState = useRealmObject(VisionService.enabledState);
  const enabled = visionEnabledState.isEnabled;

  function trackEvent(type: string, data?: Record<string, any>) {
    UsageStatisticsService.actions.recordAnalyticsEvent('VisionFeature', {
      type,
      source: 'VisionSettings',
      ...(data ?? {}),
    });
  }

  const { toggles, allFeaturesOff, setFeature } = useVisionFeatureToggles((feature, checked) => {
    trackEvent('toggle-feature', { feature, enabled: String(checked) });
    if (feature === 'automations') {
      AutomationsAnalytics.automationsToggled(checked, 'vision_settings');
    }
  });

  useEffect(() => {
    if (state.hasFailedToUpdate) {
      message.error({
        content: $t('There was an error installing Streamlabs Vision.'),
      });
    }
  }, [state.hasFailedToUpdate]);

  useEffect(() => {
    if (state.isRunning) {
      actions.requestAvailableProcesses();
      actions.requestActiveProcess();
    }
  }, [state.isRunning]);

  function onInstallClick() {
    trackEvent('install');
    actions.setIsEnabled(true);
  }

  const status = getStatusText(state);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>{$t('Streamlabs Vision')}</h1>
        {!state.installedVersion && (
          <div className={styles.headerActions}>
            <Button
              type="primary"
              disabled={!isLoggedIn || state.isStarting || state.isCurrentlyUpdating}
              onClick={onInstallClick}
            >
              {$t('Install Vision')}
            </Button>
          </div>
        )}
      </div>

      {state.isCurrentlyUpdating && (
        <VisionInstalling percent={state.percentDownloaded} isUpdate={!!state.installedVersion} />
      )}

      <VisionGeneralSettings
        isLoggedIn={isLoggedIn}
        status={status}
        enabled={enabled}
        activeProcessId={state.selectedProcessId}
        activateProcess={actions.activateProcess}
        availableGames={state.availableGames}
        selectedGame={state.selectedGame}
        toggles={toggles}
        setFeature={setFeature}
      />

      <VisionDebugSection
        isLoggedIn={isLoggedIn}
        status={status}
        enabled={enabled}
        installedVersion={state.installedVersion}
        pid={state.pid}
        port={state.port}
        openExternal={openLink}
        uninstall={actions.return.uninstall}
        availableProcesses={state.availableProcesses}
        activeProcessId={state.selectedProcessId}
        requestAvailableProcesses={actions.requestAvailableProcesses}
        activateProcess={actions.activateProcess}
        selectedGame={state.selectedGame}
        allFeaturesOff={allFeaturesOff}
      />
    </div>
  );
}
