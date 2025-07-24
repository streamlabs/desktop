import React, { CSSProperties } from 'react';
import { Button, Form, Modal } from 'antd';
import styles from './AuthModal.m.less';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import cx from 'classnames';

interface AuthModalProps {
  showModal: boolean;
  prompt: string;
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
  const title = p?.title || Services.UserService.isLoggedIn ? $t('Log Out') : $t('Login');
  const prompt = p?.prompt;
  const confirm = p?.confirm || $t('Yes');
  const cancel = p?.cancel || $t('No');

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
