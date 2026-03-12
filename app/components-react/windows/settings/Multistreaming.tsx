import * as remote from '@electron/remote';
import React from 'react';
import { useVuex } from 'components-react/hooks';
import { Services } from '../../service-provider';
import { $t } from 'services/i18n';
import { ObsSettingsSection } from './ObsSettings';
import Callout from 'components-react/shared/Callout';
import Translate from 'components-react/shared/Translate';
import UltraIcon from 'components-react/shared/UltraIcon';
import ButtonHighlighted from 'components-react/shared/ButtonHighlighted';
import styles from './Multistreaming.m.less';
import { Button } from 'antd';
import { $i } from 'services/utils';

export function MultistreamingSettings() {
  const { UserService, MagicLinkService } = Services;

  const v = useVuex(() => ({
    isLoggedIn: UserService.views.isLoggedIn,
    isPrime: UserService.views.isPrime,
  }));

  function upgradeToUltra() {
    MagicLinkService.actions.linkToPrime('slobs-multistream-settings');
  }

  function learnMoreUltra() {
    MagicLinkService.actions.linkToPrime('slobs-multistream-settings', { redirectToCheckout: false });
  }

  function learnMoreMultistreaming() {
    remote.shell.openExternal(`https://${Services.HostsService.streamlabs}/content-hub/post/what-makes-streamlabs-multistreaming-different`);
  }

  function renderFree() {
    return (
      <div className="multistream-wrapper">
        <section className={styles.multistreamUltra}>
          <h1>
            <UltraIcon style={{ marginRight: '10px' }} />
            {$t('Multistream')}
          </h1>
          <p>{$t('Grow faster and reach a wider audience by streaming to multiple destinations at once, including Twitch, YouTube, TikTok, Kick, and more. Get unlimited multistreaming with Streamlabs Ultra.')}</p>
          <img src={$i('images/multistreaming.png')} className={styles.multistreamImage} />
          <ButtonHighlighted
            text={$t('Upgrade to Ultra')}
            filledDark
            className={styles.bigButton}
            style={{ alignSelf: 'center' }}
            onClick={upgradeToUltra}
          />
          <Button type="link" style={{ alignSelf: 'center' }} onClick={learnMoreUltra}>
            {$t('Learn more about Ultra')}
          </Button>
          <Callout
            icon="icon-question"
            title={$t('Why Streamlabs Multistream?')}
            message={<>
              <p>{$t('While other providers rely on your bandwidth and PC, Streamlabs Multistream servers do the heavy lifting so you maintain your stream quality.')}</p>
              <p>
                <span style={{ fontWeight: 500 }}>{$t('New creators who multistream regularly* are 2x as likely to attract 5+ concurrent viewers.')}</span>
                <br />
                <span className={styles.calloutFootnote}>{$t('* new users who have been streaming up to six months and who have multistreamed 7+ times')}</span>
              </p>
              <Button type="link" onClick={learnMoreMultistreaming}>{$t('Learn more about Streamlabs Multistream')}</Button>
            </>}
            className={styles.callout}
          />
        </section>
      </div>
    );
  }

  function renderUltra() {
    return (
      <ObsSettingsSection title={$t('Multistream')}>
        <div style={{ marginBottom: '16px' }}>
          {$t('Go live on multiple platforms at once with Multistreaming.')}
          <ul>
            <li>
              <Translate message="Step 1: Connect your streaming accounts in the <stream>Stream</stream> settings.">
                <u slot="stream" />
              </Translate>
            </li>
            <li>
              <Translate
                // ignore \" for intl translation
                // prettier-ignore
                message={
                  'Step 2: Ensure the \"Confirm stream title and game before going live\" option is checked in the <general>General</general> settings tab."'
                }
              >
                <u slot="general" />
              </Translate>
            </li>
            <li>
              {
                // ignore \" for intl translation
                // prettier-ignore
                $t('Step 3: Select which platforms you are streaming to when you hit \"Go Live\".')
              }
            </li>
          </ul>
        </div>
      </ObsSettingsSection>
    );
  }

  return (v.isLoggedIn && !v.isPrime)
    ? renderFree()
    : renderUltra();
}
