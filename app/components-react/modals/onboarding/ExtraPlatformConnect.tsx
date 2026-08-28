import PlatformLogo from 'components-react/shared/PlatformLogo';
import React, { useState } from 'react';
import { $t } from 'services/i18n';
import styles from './ExtraPlatformConnect.m.less';
import * as remote from '@electron/remote';
import { TextInput } from 'components-react/shared/inputs/TextInput';
import { Services } from 'components-react/service-provider';
import Form from 'components-react/shared/inputs/Form';

export function ExtraPlatformConnect(p: {
  selectedExtraPlatform: 'nimotv' | undefined;
  setExtraPlatform: (val: 'nimotv' | undefined) => void;
}) {
  const { OnboardingV2Service } = Services;
  const { selectedExtraPlatform, setExtraPlatform } = p;
  const [key, setKey] = useState('');

  if (!selectedExtraPlatform) return <div></div>;

  const platformDefinition = {
    nimotv: {
      name: 'Nimo.TV',
      ingestUrl: 'rtmp://txpush.rtmp.nimo.tv/live/',
      helpUrl: 'https://article.nimo.tv/p/1033/streamlabsprotocol.html',
      icon: 'nimo-logo.png',
    },
  }[selectedExtraPlatform];

  function openHelp() {
    remote.shell.openExternal(platformDefinition.helpUrl);
  }

  function onFinish() {
    Services.StreamSettingsService.setSettings({
      key,
      streamType: 'rtmp_custom',
      server: platformDefinition.ingestUrl,
    });
    OnboardingV2Service.actions.takeStep();
  }

  return (
    <div
      style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className={styles.container} style={{ height: '50%' }}>
        <p>
          <PlatformLogo platform={selectedExtraPlatform} />
        </p>
        <h1>{$t('Connect to %{platform}', { platform: platformDefinition.name })}</h1>
        <p>
          {$t('Enter your stream key.')}
          &nbsp;
          <span onClick={openHelp}>{$t('View help docs')}</span>
        </p>

        <div className="section">
          <Form>
            <TextInput
              label={$t('Stream Key')}
              value={key}
              onChange={setKey}
              isPassword={true}
              uncontrolled={false}
            />
          </Form>
        </div>

        <p>
          <button
            className="button button--action"
            onClick={onFinish}
            disabled={!key.trim().length}
          >
            {$t('Finish')}
          </button>
        </p>

        <p>
          <span style={{ display: 'inline-block', width: 32 }}> </span>

          <a onClick={() => setExtraPlatform(undefined)}>{$t('Back')}</a>
        </p>
      </div>
    </div>
  );
}
