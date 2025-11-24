import React from 'react';
import { DisplaySection } from 'components-react/pages/onboarding/HardwareSetup';
import styles from './Common.m.less';
import { Header } from './Onboarding';
import { $t } from 'services/i18n';
import { ListInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import Form from 'components-react/shared/inputs/Form';

export function Devices() {
  const { DefaultHardwareService } = Services;

  const { videoDevices, audioDevices } = useVuex(() => ({
    videoDevices: DefaultHardwareService.videoDevices.map(device => ({
      label: device.description,
      value: device.id,
    })),
    audioDevices: DefaultHardwareService.audioDevices.map(device => ({
      label: device.description,
      value: device.id,
    })),
  }));

  return (
    <div className={styles.centered}>
      <Header
        title={$t('Set Up Your Mic & Webcam')}
        description={$t('Connect your most essential devices now or later on')}
      />
      <div style={{ display: 'flex' }}>
        <DisplaySection />
        <div className={styles.darkBox}>
          <Form layout="vertical">
            <ListInput options={videoDevices} />
            <ListInput options={audioDevices} />
            <ListInput />
          </Form>
        </div>
      </div>
    </div>
  );
}
