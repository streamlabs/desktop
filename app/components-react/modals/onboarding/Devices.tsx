import React from 'react';
import { DisplaySection } from 'components-react/pages/onboarding/HardwareSetup';
import styles from './Common.m.less';
import { Header, IOnboardingStepProps } from './Onboarding';
import { $t } from 'services/i18n';
import { ListInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import Form from 'components-react/shared/inputs/Form';

export function Devices(p: IOnboardingStepProps) {
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
    selectedVideoSource: DefaultHardwareService.selectedVideoSource,
    selectedVideoDevice: DefaultHardwareService.state.defaultVideoDevice,
    selectedAudioDevice: DefaultHardwareService.state.defaultAudioDevice,
    selectedAudioSource: DefaultHardwareService.selectedAudioSource,
  }));

  function setDevice(type: 'video' | 'audio') {
    return (value: string) => {
      DefaultHardwareService.setDefault(type, value);
    };
  }

  return (
    <div className={styles.centered}>
      <Header
        title={$t('Set Up Your Mic & Webcam')}
        description={$t('Connect your most essential devices now or later on')}
      />
      <div style={{ display: 'flex' }}>
        <DisplaySection />
        <div className={styles.darkBox} style={{ width: 360, height: 320, padding: 32 }}>
          <Form layout="vertical">
            <ListInput
              label={$t('Webcam')}
              options={videoDevices}
              value={selectedVideoDevice}
              onInput={setDevice('video')}
            />
            <ListInput
              label={$t('Microphone')}
              options={audioDevices}
              value={selectedAudioDevice}
              onInput={setDevice('audio')}
            />
          </Form>
        </div>
      </div>
    </div>
  );
}
