import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import React, { useEffect } from 'react';
import { Button, Progress } from 'antd';
import { ObsSettingsSection } from './ObsSettings';
import { confirmAsync } from 'components-react/modals';

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

function VisionInfo(props: {
  installedVersion: string;
  isRunning: boolean;
  isCurrentlyUpdating: boolean;
  pid: number;
  port: number;
}) {
  return (
    <ObsSettingsSection title="Streamlabs Vision">
      <div style={{ marginBottom: 16 }}>
        <div>Installed: {props.installedVersion ? 'Yes' : 'No'}</div>
        <div>Version: {props.installedVersion}</div>
        <div>Running: {props.isRunning ? 'Yes' : 'No'}</div>
        {props.isRunning && props.pid && <div>PID: {props.pid}</div>}
        {props.isRunning && props.port && <div>Port: {props.port}</div>}
      </div>
    </ObsSettingsSection>
  );
}

export function VisionSettings() {
  const { VisionService } = Services;
  const state = useRealmObject(VisionService.state);

  useEffect(() => {
    if (state.needsUpdate) {
      let message = 'Streamlabs Vision must be updated before you can use it.';
      let button = 'Update Now';

      if (!state.installedVersion) {
        message =
          'Streamlabs needs to download additional components. Would you like to install them now?';
        button = 'Install';
      }

      confirmAsync({ title: message, okText: button }).then(confirmed => {
        if (confirmed) {
          VisionService.actions.installOrUpdate();
        }
      });
    }
  }, []);

  return (
    <div>
      <VisionInfo
        installedVersion={state.installedVersion}
        isRunning={state.isRunning}
        isCurrentlyUpdating={state.isCurrentlyUpdating}
        pid={state.pid || 0}
        port={state.port || 0}
      />

      {state.isCurrentlyUpdating && (
        <VisionInstalling percent={state.percentDownloaded} isUpdate={!!state.installedVersion} />
      )}
    </div>
  );
}

VisionSettings.page = 'Vision';
