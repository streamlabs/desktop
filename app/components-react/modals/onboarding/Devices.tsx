import React, { useEffect } from 'react';
import { DisplaySection } from 'components-react/pages/onboarding/HardwareSetup';
import styles from './Common.m.less';
import { Header, IOnboardingStepProps } from './Onboarding';
import { $t } from 'services/i18n';
import { ListInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import Form from 'components-react/shared/inputs/Form';

export function Devices(p: IOnboardingStepProps) {
  const { DefaultHardwareService, WindowsService } = Services;

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
    WindowsService.actions.updateStyleBlockers('main', false);

    if (!selectedVideoDevice && videoDevices.length) {
      DefaultHardwareService.actions.setDefault('video', videoDevices[0].value);
    }

    return () => {
      DefaultHardwareService.actions.clearTemporarySources();
      WindowsService.actions.updateStyleBlockers('main', true);
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-evenly',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <DisplaySection />
        <div className={styles.darkBox} style={{ width: 360, height: 240, padding: 32 }}>
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
