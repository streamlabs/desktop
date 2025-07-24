import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import React, { useEffect } from 'react';
import { Button } from 'antd';

export function VisionSettings() {
  const { VisionService } = Services;
  const state = useRealmObject(VisionService.state);

  useEffect(() => {
    VisionService.loadCurrentManifest();
  }, []);

  function installVision() {
    VisionService.actions.ensureVision();
  }

  return (
    <div>
      <div>Installed: {state.installedVersion ? 'Yes' : 'No'}</div>
      {state.installedVersion && <div>Version: {state.installedVersion}</div>}
      {state.installedVersion && <div>Running: {state.isRunning ? 'Yes' : 'No'}</div>}
      {state.isCurrentlyUpdating && <div>Progress: {state.percentDownloaded}</div>}
      {state.isCurrentlyUpdating && state.isInstalling && <div>Installing...</div>}
      {!state.installedVersion && !state.isCurrentlyUpdating && (
        <Button onClick={() => installVision()}>Install</Button>
      )}
      {state.installedVersion && !state.isRunning && (
        <Button onClick={() => installVision()}>Start</Button>
      )}
      {state.isRunning && state.pid && <div>PID: {state.pid}</div>}
      {state.isRunning && state.port && <div>Port: {state.port}</div>}
    </div>
  );
}

VisionSettings.page = 'Vision';
