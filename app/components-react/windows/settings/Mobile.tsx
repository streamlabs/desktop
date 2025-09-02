import React, { useState } from 'react';
import { Button } from 'antd';
import { ObsSettingsSection } from './ObsSettings';
import { $t } from '../../../services/i18n';
import { Services } from '../../service-provider';
import { SwitchInput, TextInput } from '../../shared/inputs';
import { IConnectedDevice } from 'services/api/remote-control-api';
import styles from './Mobile.m.less';
import { useRealmObject } from 'components-react/hooks/realm';
import { useVuex } from 'components-react/hooks';
import UltraIcon from 'components-react/shared/UltraIcon';
import { $i } from 'services/utils';
import ButtonHighlighted from 'components-react/shared/ButtonHighlighted';
import UltraBox from 'components-react/shared/UltraBox';

export function MobileSettings() {
  const { RemoteControlService, UserService, TcpServerService } = Services;

  const connectedDevices = useRealmObject(RemoteControlService.connectedDevices).devices;
  const enabled = useRealmObject(RemoteControlService.state).enabled;

  const { isLoggedIn, websocketsEnabled, token, port, isPrime } = useVuex(() => ({
    isLoggedIn: UserService.views.isLoggedIn,
    websocketsEnabled: TcpServerService.state.websockets.enabled,
    token: TcpServerService.state.token,
    port: TcpServerService.state.websockets.port,
    isPrime: UserService.views.isPrime,
  }));

  function handleToggle() {
    if (enabled) {
      RemoteControlService.actions.disconnect();
    } else {
      RemoteControlService.actions.createStreamlabsRemoteConnection();
    }
  }

  function handleSocket() {
    if (websocketsEnabled) {
      TcpServerService.actions.disableWebsocketsRemoteConnections();
    } else {
      TcpServerService.actions.enableWebsoketsRemoteConnections();
    }
  }

  function getIPAddresses() {
    return TcpServerService.getIPAddresses()
      .filter(address => !address.internal)
      .map(address => address.address)
      .join(', ');
  }

  function generateToken() {
    TcpServerService.actions.generateToken();
  }

  function disconnectDevice(device: IConnectedDevice) {
    RemoteControlService.actions.disconnectDevice(device.socketId);
  }

  return (
    <>
      <h2>{$t('Mobile Streaming')}</h2>
      <ObsSettingsSection>
        <div>
          <img src={$i('images/mobile/qr_ios.png')} />
          <img src={$i('images/mobile/badge_ios.png')} />
        </div>
        <div>
          <img src={$i('images/mobile/qr_android.png')} />
          <img src={$i('images/mobile/badge_android.png')} />
        </div>
        <UltraBox>
          <UltraIcon />
          <div>
            {$t(
              'Enjoy your Ultra membership benefits on mobile including Multistream, Disconnect protection and premium themes.',
            )}
          </div>
          <ButtonHighlighted title={$t('Join Ultra')} />
        </UltraBox>
      </ObsSettingsSection>
      <h2>{$t('Remote Controller')}</h2>
      <ObsSettingsSection>
        <div>
          {$t(
            'The free Streamlabs Controller app allows you to control Streamlabs Desktop from your iOS or Android device. You must be logged in to use this feature.',
          )}
          <br />
          <br />
        </div>

        <div>
          {isLoggedIn && (
            <SwitchInput
              label={$t('Allow Controller app connections')}
              onInput={handleToggle}
              value={enabled}
              layout="horizontal"
            />
          )}

          {enabled && (
            <div style={{ paddingBottom: 8 }}>
              <span>{$t('Connected Devices')}</span>
              {connectedDevices.length < 1 && (
                <span className={styles.whisper}>{$t('No devices connected')}</span>
              )}
              {connectedDevices.map(device => (
                <div className={styles.device}>
                  <span>{device.deviceName}</span>
                  <span className={styles.disconnect} onClick={() => disconnectDevice(device)}>
                    {$t('Disconnect')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ObsSettingsSection>
      <h2>{$t('Third Party Connections')}</h2>
      <ObsSettingsSection>
        <div>
          {$t(
            'Some third party applications connect to Streamlabs Desktop via websockets connection. Toggle this to allow such connections and display connection info.',
          )}
          <br />
          <span style={{ color: 'var(--info)', display: 'inline' }}>
            <i className="icon-error" />
            &nbsp;
            {$t('Warning: Displaying this portion on stream may leak sensitive information.')}
          </span>
          <br />
          <br />
        </div>
        <div>
          <SwitchInput
            label={$t('Allow third party connections')}
            onInput={handleSocket}
            value={websocketsEnabled}
            layout="horizontal"
          />
          {websocketsEnabled && (
            <div className={styles.websocketsForm}>
              <TextInput label={$t('IP Addresses')} value={getIPAddresses()} readOnly />
              <TextInput label={$t('Port')} value={port.toString(10)} readOnly />
              <TextInput
                label={$t('API Token')}
                value={token}
                readOnly
                addonAfter={<Button onClick={generateToken}>{$t('Generate new')}</Button>}
              />
            </div>
          )}
        </div>
      </ObsSettingsSection>
    </>
  );
}

MobileSettings.page = 'Mobile';
