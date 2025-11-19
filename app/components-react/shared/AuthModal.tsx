import React, { CSSProperties, useMemo } from 'react';
import { Button, Form, Modal } from 'antd';
import styles from './AuthModal.m.less';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';

interface AuthModalProps {
  showModal: boolean;
  prompt?: string;
  handleAuth: () => void;
  handleShowModal: (status: boolean) => void;
  title?: string;
  cancel?: string;
  confirm?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

export function AuthModal(p: AuthModalProps) {
  const { UserService } = Services;

  const { isLoggedIn, primaryPlatform, name } = useVuex(() => ({
    isLoggedIn: UserService.views.isLoggedIn,
    primaryPlatform: UserService.views.auth?.primaryPlatform,
    name: UserService.views.username,
  }));

  const title = p?.title || isLoggedIn ? $t('Log Out') : $t('Login');
  const confirm = p?.confirm || $t('Yes');
  const cancel = p?.cancel || $t('No');

  const prompt = useMemo(() => {
    if (p.prompt) return p.prompt;

    // Instagram doesn't provide a username, since we're not really linked, pass undefined for a generic logout msg w/o it
    const username =
      isLoggedIn && primaryPlatform && primaryPlatform !== 'instagram' ? name : undefined;

    return username
      ? $t('Are you sure you want to log out %{username}?', { username })
      : $t('Are you sure you want to log out?');
  }, [p.prompt, name, isLoggedIn, primaryPlatform]);

  return (
    <Modal
      footer={null}
      visible={p.showModal}
      onCancel={() => p.handleShowModal(false)}
      getContainer={false}
      className={cx(styles.authModalWrapper, p?.className)}
    >
      <Form id={p?.id} className={styles.authModal}>
        <h2>{title}</h2>
        {prompt}
        <div className={styles.buttons}>
          <Button onClick={p.handleAuth}>{confirm}</Button>
          <Button onClick={() => p.handleShowModal(false)}>{cancel}</Button>
        </div>
      </Form>
    </Modal>
  );
}
