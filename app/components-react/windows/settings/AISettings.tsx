import * as remote from '@electron/remote';
import { message, Progress, Select } from 'antd';
import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import { SwitchInput } from 'components-react/shared/inputs';
import React, { useEffect, useMemo } from 'react';
import { $t } from 'services/i18n/index';
import { VisionProcess, VisionService, VisionState } from 'services/vision';
import { ObsSettingsSection } from './ObsSettings';

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

type VisionInfoProps = {
  status: VisionStatus;
  enabled: boolean;
  starting: boolean;
  installedVersion: string;
  pid?: number;
  port?: number;
  availableProcesses: VisionProcess[];
  activeProcessId: number;
  availableGames: Dictionary<string>;
  selectedGame: string;
  setIsEnabled: VisionService['actions']['setIsEnabled'];
  requestAvailableProcesses: VisionService['actions']['requestAvailableProcesses'];
  activateProcess: VisionService['actions']['activateProcess'];
  openExternal: (url: string) => void;
};

function VisionInfo({
  status,
  enabled,
  starting,
  installedVersion,
  pid,
  port,
  setIsEnabled,
  openExternal,
  activeProcessId,
  availableProcesses,
  requestAvailableProcesses,
  activateProcess,
  availableGames,
  selectedGame,
}: VisionInfoProps) {
  const eventsUrl = useMemo(() => buildLocalUrl(port, '/events'), [port]);
  const frameUrl = useMemo(() => buildLocalUrl(port, '/display_frame'), [port]);
  const isRunning = useMemo(() => status === 'running', [status]);

  return (
    <ObsSettingsSection title="Streamlabs AI">
      <div style={{ marginBottom: 16 }}>
        <SwitchInput
          label={$t('Turn On AI')}
          disabled={starting}
          value={enabled}
          onChange={() => setIsEnabled(!enabled)}
        />
        <div>
          {$t('Installed')}: {installedVersion ? `${$t('Yes')} (${installedVersion})` : $t('No')}
        </div>
        <div>
          {$t('PID')}: {pid || ''}
        </div>
        <div>
          {$t('Port')}: {port || ''}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
          <button
            className="button button--action"
            disabled={!isRunning || !eventsUrl}
            onClick={() => eventsUrl && openExternal(eventsUrl)}
          >
            {$t('Open Events Log')}
          </button>
          <button
            className="button button--action"
            disabled={!isRunning || !frameUrl}
            onClick={() => frameUrl && openExternal(frameUrl)}
          >
            {$t('Open Display Frame')}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6 }}>{$t('Active Process')}</div>
            <Select
              style={{ minWidth: 240 }}
              disabled={!enabled || !isRunning}
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

          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6 }}>{$t('Selected Game')}</div>
            <Select
              style={{ minWidth: 240 }}
              disabled={!enabled || !isRunning}
              value={selectedGame}
              onChange={val => {
                console.log('Changing game to: ', val);
                activateProcess(activeProcessId, val);
              }}
            >
              {Object.entries(availableGames).map(([key, label]) => (
                <Select.Option key={key} value={key}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </ObsSettingsSection>
  );
}

function openLink(url: string) {
  remote.shell.openExternal(url);
}

export function AISettings() {
  const { UsageStatisticsService, VisionService } = Services;
  const actions = VisionService.actions;
  const state = useRealmObject(VisionService.state);

  const visionEnabledState = useRealmObject(VisionService.enabledState);
  const enabled = visionEnabledState.isEnabled;

  function trackEvent(type: string, data?: Record<string, any>) {
    UsageStatisticsService.actions.recordAnalyticsEvent('AiFeature', {
      type,
      source: 'AiSettings',
      ...(data ?? {}),
    });
  }

  useEffect(() => {
    if (state.hasFailedToUpdate) {
      message.error({
        content: $t('There was an error installing Streamlabs AI.'),
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

  return (
    <div>
      <VisionInfo
        status={getStatusText(state)}
        enabled={enabled}
        starting={state.isStarting}
        installedVersion={state.installedVersion}
        pid={state.pid}
        port={state.port}
        openExternal={openLink}
        setIsEnabled={onToggleAiClick}
        availableProcesses={state.availableProcesses}
        activeProcessId={state.selectedProcessId}
        requestAvailableProcesses={actions.requestAvailableProcesses}
        activateProcess={actions.activateProcess}
        availableGames={state.availableGames}
        selectedGame={state.selectedGame}
      />

      {state.isCurrentlyUpdating && (
        <VisionInstalling percent={state.percentDownloaded} isUpdate={!!state.installedVersion} />
      )}
    </div>
  );
}
