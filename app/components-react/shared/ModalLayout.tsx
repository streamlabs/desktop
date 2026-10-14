import { Button } from 'antd';
import { ModalProps } from 'antd/lib/modal';
import cx from 'classnames';
import { useRealmObject } from 'components-react/hooks/realm';
import React, { CSSProperties, ReactNode } from 'react';
import { $t } from '../../services/i18n';
import { byOS, OS } from '../../util/operating-systems';
import { Services } from '../service-provider';
import styles from './ModalLayout.m.less';
import Scrollable from './Scrollable';

// use props of Modal from the antd lib
type TProps = {
  children: ReactNode;
  fixedChild?: ReactNode;
  hideFooter?: boolean;
  scrollable?: boolean;
  wrapperStyle?: React.CSSProperties;
  className?: string;
  bodyClassName?: string;
  id?: string;
} & Pick<ModalProps, 'footer' | 'onOk' | 'okText' | 'bodyStyle' | 'confirmLoading' | 'onCancel'>;

const isMac = byOS({ [OS.Windows]: false, [OS.Mac]: true });

const fixedStyles: CSSProperties = {
  height: '200px',
  background: 'var(--section)',
  margin: 0,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

/**
 * Wraps content for the child windows
 */
export function ModalLayout(p: TProps) {
  const footerHeight = p.hideFooter ? 0 : 53;
  const bodyStyles: CSSProperties = {
    height: p.fixedChild
      ? `calc(100% - ${footerHeight + 200}px)`
      : `calc(100% - ${footerHeight}px)`,
    ...(p.bodyStyle || {}),
  };

  // inject services
  const { WindowsService, CustomizationService } = Services;

  const currentTheme = useRealmObject(CustomizationService.state).theme;

  // define a close method for the modal
  function close() {
    WindowsService.actions.closeChildWindow();
  }

  // pick variables for the template

  // render a default footer with action buttons
  function DefaultFooter() {
    const okText = p.okText || $t('Done');
    const closeFunc = p.onCancel || close;
    return (
      <>
        <Button onClick={closeFunc}>{$t('Close')}</Button>
        {p.onOk && (
          <Button onClick={p.onOk} type="primary" disabled={p.confirmLoading}>
            {p.confirmLoading && (
              <i className="fa fa-pulse fa-spinner" style={{ marginRight: 8 }} />
            )}
            {okText}
          </Button>
        )}
      </>
    );
  }

  return (
    <div
      className={cx(
        'ant-modal-content',
        styles.modalLayout,
        { [styles.modalLayoutMac]: isMac },
        currentTheme,
        p.className,
      )}
      style={p.wrapperStyle}
      id={p.id}
    >
      {p.fixedChild && <div style={fixedStyles}>{p.fixedChild}</div>}

      {p.scrollable ? (
        <div style={bodyStyles}>
          <Scrollable isResizable={false} style={{ height: '100%' }}>
            <div className={cx('ant-modal-body', p.bodyClassName)}>{p.children}</div>
          </Scrollable>
        </div>
      ) : (
        <div className={cx('ant-modal-body', p.bodyClassName)} style={bodyStyles}>
          {p.children}
        </div>
      )}

      {!p.hideFooter && <div className="ant-modal-footer">{p.footer || <DefaultFooter />}</div>}
    </div>
  );
}
