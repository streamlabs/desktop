import React, { ReactNode, CSSProperties } from 'react';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import { getOS, OS } from '../../util/operating-systems';
import cx from 'classnames';
import { $t } from '../../services/i18n';
import css from './ModalLayout.m.less';
import { Button } from 'antd';
import { ModalProps } from 'antd/lib/modal';
import Scrollable from './Scrollable';
import { useRealmObject } from 'components-react/hooks/realm';

// use props of Modal from the antd lib
type TProps = {
  children: ReactNode;
  fixedChild?: ReactNode;
  hideFooter?: boolean;
  scrollable?: boolean;
  wrapperStyle?: React.CSSProperties;
  className?: string;
} & Pick<ModalProps, 'footer' | 'onOk' | 'okText' | 'bodyStyle' | 'confirmLoading' | 'onCancel'>;

// calculate OS dependent styles
const titleHeight = getOS() === OS.Mac ? 22 : 30;
const wrapperStyles: CSSProperties = {
  height: `calc(100% - ${titleHeight}px)`,
};
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
      className={cx('ant-modal-content', currentTheme, p.className)}
      style={{ ...wrapperStyles, ...p.wrapperStyle }}
    >
      {p.fixedChild && <div style={fixedStyles}>{p.fixedChild}</div>}

      {p.scrollable ? (
        <div style={bodyStyles}>
          <Scrollable isResizable={false} style={{ height: '100%' }}>
            <div className="ant-modal-body">{p.children}</div>
          </Scrollable>
        </div>
      ) : (
        <div className="ant-modal-body" style={bodyStyles}>
          {p.children}
        </div>
      )}

      {!p.hideFooter && <div className="ant-modal-footer">{p.footer || <DefaultFooter />}</div>}
    </div>
  );
}
