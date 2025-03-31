import styles from './GoLiveError.m.less';
import React, { useState, HTMLAttributes } from 'react';
import { errorTypes, IStreamError } from '../../../services/streaming/stream-error';
import { $t } from '../../../services/i18n';
import { Alert } from 'antd';
import cx from 'classnames';
import { EDismissable } from 'services/dismissables';
import { Services } from '../../service-provider';
import { useVuex } from 'components-react/hooks';

interface IMessageLayoutProps {
  error?: IStreamError;
  /**
   * overrides the error message if provided
   */
  message?: string;
  type?: 'error' | 'success' | 'info' | 'warning';
  details?: string;
  hasButton?: boolean;
  closable?: boolean;
  onClose?: () => void;
  dismissableKey?: EDismissable;
}

/**
 * Layout for displaying an single success message or error
 */
export default function MessageLayout(p: IMessageLayoutProps & HTMLAttributes<unknown>) {
  const [isErrorDetailsShown, setDetailsShown] = useState(false);

  const { shouldShow } = useVuex(() => ({
    shouldShow: p?.dismissableKey
      ? Services.DismissablesService.views.shouldShow(p?.dismissableKey)
      : true,
  }));

  if (!shouldShow) return <></>;

  const error = p.error;
  const details = error?.details ?? p?.details;
  const type = p?.type ?? 'error';
  const message = p.message || error?.message || (p.error && errorTypes[p.error.type]?.message);
  const hasButton = p.hasButton;

  function render() {
    return (
      <div className={styles.container}>
        <Alert
          type={type}
          message={message}
          showIcon
          description={renderDescription()}
          closable={p?.closable}
          onClose={p?.onClose}
        />
      </div>
    );
  }

  function renderDescription() {
    return (
      <div style={{ marginTop: '16px' }}>
        <div>{p.children}</div>
        <div className={cx({ [styles.ctaBtn]: hasButton })}>
          {details && !isErrorDetailsShown && (
            <a className={styles.link} onClick={() => setDetailsShown(true)}>
              {$t('Show details')}
            </a>
          )}
          {details && isErrorDetailsShown && (
            <div className={styles.details}>
              {details}
              <br />
              <br />
              {error?.status} {error?.statusText} {error?.url}
            </div>
          )}
        </div>
      </div>
    );
  }

  return render();
}
