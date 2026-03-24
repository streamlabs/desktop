import * as remote from '@electron/remote';
import { message, Progress, Select } from 'antd';
import { useRealmObject } from 'components-react/hooks/realm';
import { confirmAsync } from 'components-react/modals';
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
  needsUpdate: boolean;
  installedVersion: string;
  pid?: number;
  port?: number;
  availableProcesses: VisionProcess[];
  activeProcessId: number;
  availableGames: Dictionary<string>;
  selectedGame: string;
  setIsEnabled: VisionService['actions']['setIsEnabled'];
  requestAvailableProcesses: VisionService['actions']['requestActiveProcess'];
  activateProcess: VisionService['actions']['activateProcess'];
  startProcess: VisionService['actions']['ensureRunning'];
  ensureUpdated: VisionService['actions']['ensureUpdated'];
  stopProcess: VisionService['actions']['stop'];
  openExternal: (url: string) => void;
};

function VisionInfo({
  status,
  enabled,
  starting,
  needsUpdate,
  installedVersion,
  pid,
  port,
  setIsEnabled,
  startProcess,
  stopProcess,
  ensureUpdated,
  openExternal,
  activeProcessId,
  availableProcesses,
  requestAvailableProcesses,
  activateProcess,
  availableGames,
  selectedGame,
}: VisionInfoProps) {
  const activeProcess = availableProcesses?.find(p => p.pid === activeProcessId);
  const eventsUrl = useMemo(() => buildLocalUrl(port, '/events'), [port]);
  const frameUrl = useMemo(() => buildLocalUrl(port, '/display_frame'), [port]);
  const isQaBundle = useMemo(
    () =>
      remote.process.argv.includes('--bundle-qa') && activeProcess?.executable_name === 'vlc.exe',
    [activeProcess],
  );
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
          Installed: {installedVersion ? $t('Yes') : $t('No')}
          {installedVersion ? ` (${installedVersion})` : ''}
        </div>
        <div>Status: {status}</div>

        {status === 'running' && !!pid && <div>PID: {pid}</div>}
        {status === 'running' && !!port && <div>Port: {port}</div>}

        {status === 'stopped' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
            {needsUpdate && (
              <button className="button button--action" onClick={() => ensureUpdated()}>
                Update Streamlabs AI
              </button>
            )}

            {!needsUpdate && (
              <button
                className="button button--action"
                disabled={!enabled}
                onClick={e => startProcess({ debugMode: e.ctrlKey })}
              >
                Start Streamlabs AI
              </button>
            )}
          </div>
        )}

        {status === 'running' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
            {eventsUrl && (
              <button className="button button--action" onClick={() => openExternal(eventsUrl)}>
                Open Events Log
              </button>
            )}

            {frameUrl && (
              <button className="button button--action" onClick={() => openExternal(frameUrl)}>
                Open Display Frame
              </button>
            )}

            <button className="button button--warn" onClick={stopProcess}>
              Stop Streamlabs AI
            </button>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {status === 'running' && availableProcesses && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 6 }}>Active Process</div>
              <Select
                style={{ minWidth: 240 }}
                value={activeProcessId}
                onFocus={() => requestAvailableProcesses()}
                onChange={val => activateProcess(val, selectedGame)}
              >
                {availableProcesses.map(p => (
                  <Select.Option key={p.pid} value={p.pid}>
                    {p.title || p.executable_name}
                  </Select.Option>
                ))}
              </Select>
            </div>
          )}

          {status === 'running' &&
            (activeProcess?.type === 'capture_device' || isQaBundle) &&
            availableGames &&
            Object.keys(availableGames).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 6 }}>Selected Game</div>
                <Select
                  style={{ minWidth: 240 }}
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
            )}
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

  const promptOpen = React.useRef(false);

  function trackEvent(type: string, data?: Record<string, any>) {
    UsageStatisticsService.actions.recordAnalyticsEvent('AiFeature', {
      type,
      source: 'AiSettings',
      ...(data ?? {}),
    });
  }

  useEffect(() => {
    // make sure we don't keep opening confirm dialogs
    if (promptOpen.current) return;

    // do we need to update?
    if (!state.needsUpdate) return;

    let message = 'Streamlabs AI must be updated before you can use it.';
    let button = 'Update Now';

    if (!state.installedVersion) {
      message =
        'Streamlabs needs to download additional components. Would you like to install them now?';
      button = 'Install';
    }

    promptOpen.current = true;

    confirmAsync({ title: message, okText: button }).then(confirmed => {
      promptOpen.current = false;
      if (confirmed) {
        actions.ensureUpdated();
      }
    });
  }, []);

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
        needsUpdate={state.needsUpdate}
        installedVersion={state.installedVersion}
        pid={state.pid}
        port={state.port}
        stopProcess={actions.stop}
        openExternal={openLink}
        setIsEnabled={onToggleAiClick}
        startProcess={actions.ensureRunning}
        ensureUpdated={actions.ensureUpdated}
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
