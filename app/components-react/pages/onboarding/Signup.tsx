import React from 'react';
import { $t } from 'services/i18n';
import Translate from 'components-react/shared/Translate';
import PlatformButton from 'components-react/shared/PlatformButton';
import styles from './Signup.m.less';
import { Services } from 'components-react/service-provider';
import { EPlatformCallResult } from 'services/platforms';

export default function Signup({
  onSignupLinkClick,
  onSuccess,
}: {
  onSignupLinkClick: () => void;
  onSuccess: () => void;
}) {
  const { UserService } = Services;

  const openSLIDSignup = () =>
    UserService.startSLAuth({ signup: true })
      .then((success: EPlatformCallResult) => {
        if (success !== EPlatformCallResult.Success) return;
        onSuccess();
      })
      .catch(e => console.error('Signup Error: ', e));

  return (
    <>
      <p className={styles.signupSubtitle}>
        {$t(
          'Create an account to unlock the most useful features like Streaming, Themes, Highlighter, App Store, Collab Cam and more!',
        )}
      </p>

      <PlatformButton platform="streamlabs" onClick={openSLIDSignup}>
        <Translate message={$t('Create a <span>Streamlabs ID</span>')}>
          <span slot="span" style={{ fontWeight: 'bold' }} />
        </Translate>
      </PlatformButton>

      <span className={styles.signupTextContainer}>
        <Translate message={$t('Already have an account? <span>Login</span>')}>
          <a slot="span" style={{ textDecoration: 'underline' }} onClick={onSignupLinkClick} />
        </Translate>
      </span>
    </>
  );
}
