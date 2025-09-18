import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import React, { useEffect, useMemo } from 'react';
import { message, Progress } from 'antd';
import { ObsSettingsSection } from './ObsSettings';
import { confirmAsync } from 'components-react/modals';
import * as remote from '@electron/remote';
import { VisionRunnerStartOptions } from 'services/vision/vision-runner';
import { $t } from 'services/i18n/index';
import { VisionState } from 'services/vision';
import { ESettingsCategory } from 'services/settings';

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
  needsUpdate: boolean;
  installedVersion: string;
  pid?: number;
  port?: number;
  startProcess: (opts?: VisionRunnerStartOptions) => void;
  ensureUpdated: () => void;
  stopProcess: () => void;
  openExternal: (url: string) => void;
};

function VisionInfo({
  status,
  needsUpdate,
  installedVersion,
  pid,
  port,
  startProcess,
  stopProcess,
  ensureUpdated,
  openExternal,
}: VisionInfoProps) {
  const eventsUrl = useMemo(() => buildLocalUrl(port, '/events'), [port]);
  const frameUrl = useMemo(() => buildLocalUrl(port, '/display_frame'), [port]);

  return (
    <ObsSettingsSection title="Streamlabs AI">
      <div style={{ marginBottom: 16 }}>
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
      </div>
    </ObsSettingsSection>
  );
}

function openLink(url: string) {
  remote.shell.openExternal(url);
}

export function AISettings() {
  const { VisionService } = Services;
  const state = useRealmObject(VisionService.state);
  const actions = VisionService.actions;
  const promptOpen = React.useRef(false);

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

  return (
    <div>
      <VisionInfo
        status={getStatusText(state)}
        needsUpdate={state.needsUpdate}
        installedVersion={state.installedVersion}
        pid={state.pid}
        port={state.port}
        stopProcess={() => actions.stop()}
        openExternal={openLink}
        startProcess={(options: VisionRunnerStartOptions) => actions.ensureRunning(options)}
        ensureUpdated={() => actions.ensureUpdated()}
      />

      {state.isCurrentlyUpdating && (
        <VisionInstalling percent={state.percentDownloaded} isUpdate={!!state.installedVersion} />
      )}
    </div>
  );
}

AISettings.page = ESettingsCategory.AI;
