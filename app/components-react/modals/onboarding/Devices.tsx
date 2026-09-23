import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import Display from 'components-react/shared/Display';
import { ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import React, { useEffect, useRef } from 'react';
import { Volmeter2d } from 'services/audio/volmeter-2d';
import { $t } from 'services/i18n';
import { ERenderingMode } from '../../../../obs-api';
import styles from './Common.m.less';
import { Header } from './Onboarding';

export function Devices() {
  const { DefaultHardwareService } = Services;

  const { videoDevices, audioDevices, selectedAudioDevice, selectedVideoDevice } = useVuex(() => ({
    videoDevices: DefaultHardwareService.videoDevices.map(device => ({
      label: device.description,
      value: device.id,
    })),
    audioDevices: DefaultHardwareService.audioDevices.map(device => ({
      label: device.description,
      value: device.id,
    })),
    selectedVideoDevice: DefaultHardwareService.state.defaultVideoDevice,
    selectedAudioDevice: DefaultHardwareService.state.defaultAudioDevice,
  }));

  // Set up temporary sources
  useEffect(() => {
    DefaultHardwareService.createTemporarySources();

    if (!selectedVideoDevice && videoDevices.length) {
      DefaultHardwareService.actions.setDefault('video', videoDevices[0].value);
    }

    return () => {
      DefaultHardwareService.actions.clearTemporarySources();
    };
  }, []);

  function setDevice(type: 'video' | 'audio') {
    return (value: string) => {
      DefaultHardwareService.actions.setDefault(type, value);
    };
  }

  return (
    <div className={styles.centered}>
      <Header
        title={$t('Set Up Your Mic & Webcam')}
        description={$t('Connect your most essential devices now or later on')}
      />
      <div className={styles.devices}>
        <DisplaySection />
        <div className={styles.devicesPicker}>
          <Form layout="vertical">
            <ListInput
              label={$t('Webcam')}
              options={videoDevices}
              value={selectedVideoDevice}
              onChange={setDevice('video')}
              style={{ width: 200 }}
            />
            <ListInput
              label={$t('Microphone')}
              options={audioDevices}
              value={selectedAudioDevice}
              onChange={setDevice('audio')}
              style={{ width: 200 }}
            />
          </Form>
        </div>
      </div>
    </div>
  );
}

function DisplaySection() {
  const { DefaultHardwareService } = Services;
  const v = useVuex(() => ({
    videoDevices: DefaultHardwareService.videoDevices,
    selectedVideoSource: DefaultHardwareService.selectedVideoSource,
    selectedAudioSource: DefaultHardwareService.selectedAudioSource,
  }));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Set up volmeter
  useEffect(() => {
    if (canvasRef.current && v.selectedAudioSource) {
      const volmeter2d = new Volmeter2d(v.selectedAudioSource, canvasRef.current);

      return () => volmeter2d.destroy();
    }
  }, [canvasRef.current, v.selectedAudioSource]);

  if (v.selectedVideoSource && v.videoDevices.length) {
    return (
      <div className={styles.devicesDisplay}>
        <div className={cx(styles.devicesDisplayWrapper)}>
          <Display
            sourceId={v.selectedVideoSource.sourceId}
            renderingMode={ERenderingMode.OBS_MAIN_RENDERING}
            isModal
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <canvas ref={canvasRef} style={{ backgroundColor: 'var(--border)', width: '100%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.placeholder}>
      <span>{$t('No webcam detected')}</span>
    </div>
  );
}
