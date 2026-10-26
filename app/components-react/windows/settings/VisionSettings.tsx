import * as remote from '@electron/remote';
import { Button, message, Progress, Select, Switch } from 'antd';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import React, { useEffect, useMemo, useState } from 'react';
import { $t } from 'services/i18n/index';
import { VisionProcess, VisionService, VisionState } from 'services/vision';
import { ObsSettingsSection } from './ObsSettings';
import styles from './VisionSettings.m.less';

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
}: Pick<
  VisionInfoProps,
  | 'isLoggedIn'
  | 'status'
  | 'enabled'
  | 'activeProcessId'
  | 'activateProcess'
  | 'availableGames'
  | 'selectedGame'
>) {
  const [automationsEnabled, setAutomationsEnabled] = useState(false);
  const [reactiveOverlaysEnabled, setReactiveOverlaysEnabled] = useState(false);
  const [gamePulseEnabled, setGamePulseEnabled] = useState(false);
  const [sidekickEnabled, setSidekickEnabled] = useState(false);

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
          checked={automationsEnabled}
          onChange={checked => {
            // TODO @vision: wire up automations toggle
            setAutomationsEnabled(checked);
          }}
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
          checked={reactiveOverlaysEnabled}
          onChange={checked => {
            // TODO @vision: wire up reactive overlays toggle
            setReactiveOverlaysEnabled(checked);
          }}
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
          checked={gamePulseEnabled}
          onChange={checked => {
            // TODO @vision: wire up game pulse widget toggle
            setGamePulseEnabled(checked);
          }}
        />
      </VisionOption>

      <VisionOption
        title={$t('Sidekick')}
        description={$t('Sidekick is a virtual co-host, live producer, and technical assistant.')}
      >
        <Switch
          size="small"
          checked={sidekickEnabled}
          onChange={checked => {
            // TODO @vision: wire up sidekick toggle
            setSidekickEnabled(checked);
          }}
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
  selectedGame,
}: Omit<VisionInfoProps, 'availableGames'>) {
  const eventsUrl = useMemo(() => buildLocalUrl(port, '/events'), [port]);
  const frameUrl = useMemo(() => buildLocalUrl(port, '/display_frame'), [port]);
  const isRunning = status === 'running';

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

  function onToggleAiClick(isEnabled?: boolean) {
    const newIsEnabled = isEnabled ?? !enabled;
    trackEvent('enabled', { enabled: String(newIsEnabled) });
    actions.setIsEnabled(newIsEnabled);
  }

  const status = getStatusText(state);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>{$t('Streamlabs Vision')}</h1>
        <div className={styles.headerActions}>
          <Button
            type={enabled ? 'default' : 'primary'}
            disabled={!isLoggedIn || state.isStarting}
            onClick={() => onToggleAiClick()}
          >
            {enabled ? $t('Disable Vision') : $t('Turn on Vision')}
          </Button>
        </div>
      </div>

      <VisionGeneralSettings
        isLoggedIn={isLoggedIn}
        status={status}
        enabled={enabled}
        activeProcessId={state.selectedProcessId}
        activateProcess={actions.activateProcess}
        availableGames={state.availableGames}
        selectedGame={state.selectedGame}
      />

      <VisionDebugSection
        isLoggedIn={isLoggedIn}
        status={status}
        enabled={enabled}
        installedVersion={state.installedVersion}
        pid={state.pid}
        port={state.port}
        openExternal={openLink}
        availableProcesses={state.availableProcesses}
        activeProcessId={state.selectedProcessId}
        requestAvailableProcesses={actions.requestAvailableProcesses}
        activateProcess={actions.activateProcess}
        selectedGame={state.selectedGame}
      />

      {state.isCurrentlyUpdating && (
        <VisionInstalling percent={state.percentDownloaded} isUpdate={!!state.installedVersion} />
      )}
    </div>
  );
}
