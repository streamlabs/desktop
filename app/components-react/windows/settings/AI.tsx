import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import React, { useEffect } from 'react';
import { Button, Progress } from 'antd';
import { ObsSettingsSection } from './ObsSettings';
import { confirmAsync } from 'components-react/modals';
import * as remote from '@electron/remote';
import { VisionRunnerStartOptions } from 'services/vision/vision-runner';

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

type VisionStatus = 'running' | 'starting' | 'updating' | 'stopped';

function VisionInfo(props: {
  status: VisionStatus;
  installedVersion: string;
  pid: number;
  port: number;
  stopVisionProcess: () => void;
  openEventsLog: () => void;
  openDisplayFrame: () => void;
  startProcess: (options?: VisionRunnerStartOptions) => void;
}) {
  return (
    <ObsSettingsSection title="Streamlabs AI">
      <div style={{ marginBottom: 16 }}>
        <div>Installed: {props.installedVersion ? 'Yes' : 'No'}</div>
        <div>Version: {props.installedVersion}</div>
        <div>Status: {props.status}</div>

        {props.status === 'running' && props.pid && <div>PID: {props.pid}</div>}
        {props.status === 'running' && props.port && <div>Port: {props.port}</div>}

        {props.status === 'stopped' && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '16px',
            }}
          >
            <button className="button button--action" onClick={() => props.startProcess()}>
              Start AI
            </button>

            <button
              className="button button--warn"
              onClick={() => props.startProcess({ debugMode: true })}
            >
              Start AI (debug)
            </button>
          </div>
        )}

        {props.status === 'running' && props.port && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '16px',
            }}
          >
            <button className="button button--action" onClick={props.openEventsLog}>
              Open Events Log
            </button>

            <button className="button button--action" onClick={props.openDisplayFrame}>
              Open Display Frame
            </button>

            <button className="button button--warn" onClick={props.stopVisionProcess}>
              Stop AI
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
        VisionService.actions.ensureUpdated();
      }
    });
  }, []);

  return (
    <div>
      <VisionInfo
        status={
          // eslint-disable-next-line no-nested-ternary
          state.isRunning
            ? 'running' // eslint-disable-next-line no-nested-ternary
            : state.isCurrentlyUpdating
            ? 'updating'
            : state.isStarting
            ? 'starting'
            : 'stopped'
        }
        installedVersion={state.installedVersion}
        pid={state.pid || 0}
        port={state.port || 0}
        stopVisionProcess={() => VisionService.actions.stop()}
        openEventsLog={() => openLink(`http://localhost:${state.port}/events`)}
        openDisplayFrame={() => openLink(`http://localhost:${state.port}/display_frame`)}
        startProcess={(options: VisionRunnerStartOptions) =>
          VisionService.actions.ensureRunning(options)
        }
      />

      {state.isCurrentlyUpdating && (
        <VisionInstalling percent={state.percentDownloaded} isUpdate={!!state.installedVersion} />
      )}
    </div>
  );
}

AISettings.page = 'AI';
