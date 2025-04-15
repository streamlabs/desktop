import { Services } from './service-provider';
import { Modal, Button } from 'antd';
import Utils from '../services/utils';
import { ModalFuncProps } from 'antd/lib/modal';
import { $t } from '../services/i18n';
import { TextInput } from './shared/inputs/TextInput';
import Form, { useForm } from './shared/inputs/Form';
import React, { useEffect } from 'react';
import { Observable, Subject } from 'rxjs';
import { FormProps } from 'antd/es';
import { ModalLayout } from './shared/ModalLayout';
import styles from './shared/Modals.m.less';

/**
 * Show an Confirmation modal and return a Promise<confirmed: boolean>
 * Uses Modal.confirm under the hood
 *
 * @example
 * confirmAsync('Confirm me')
 * .then(confirmed => console.log(confirmed ? 'Confirmed' : 'Canceled'))
 *
 */
export function confirmAsync(
  p: Omit<ModalFuncProps, 'afterClose' | 'onOk' | 'onCancel'> | string,
): Promise<boolean> {
  const { WindowsService } = Services;
  const modalProps = typeof p === 'string' ? { title: p } : p;
  WindowsService.updateStyleBlockers(Utils.getWindowId(), true);
  return new Promise(resolve => {
    Modal.confirm({
      ...modalProps,
      afterClose: () => {
        WindowsService.updateStyleBlockers(Utils.getWindowId(), false);
      },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
    fixBodyWidth();
  });
}

/**
 * The asynchronous alternative for Windows.alert
 * Uses Modal.info under the hood
 * @example
 * alert('This is Alert').then(() => console.log('Alert closed'))
 *
 */
export function alertAsync(p: Omit<ModalFuncProps, 'afterClose'> | string): Promise<void> {
  const modalProps = typeof p === 'string' ? { title: p } : p;
  const { WindowsService } = Services;
  WindowsService.updateStyleBlockers(Utils.getWindowId(), true);
  return new Promise(resolve => {
    Modal.confirm({
      okText: $t('Close'),
      cancelButtonProps: { style: { display: 'none' } },
      okButtonProps: { type: 'default' },
      ...modalProps,
      afterClose: () => {
        WindowsService.updateStyleBlockers(Utils.getWindowId(), false);
        resolve();
      },
    });
    fixBodyWidth();
  });
}

/**
 * Async version of window.prompt
 *
 */
export function promptAsync(
  p: (ModalFuncProps & { placeholder?: string }) | string,
  value: string = '',
): Promise<string> {
  const { WindowsService } = Services;
  const modalProps = typeof p === 'string' ? { title: p } : p;
  WindowsService.updateStyleBlockers(Utils.getWindowId(), true);

  return new Promise<string>(resolve => {
    const formValues = { prompt: value };

    function onValuesChange(values: Record<string, unknown>) {
      Object.assign(formValues, values);
    }

    function onFinish() {
      resolve(formValues.prompt);
      dialog.destroy();
    }

    const submitEmitter = new Subject();

    const dialog = Modal.info({
      centered: true,
      icon: null,
      ...modalProps,
      content: (
        <DefaultPromptForm
          values={formValues}
          onValuesChange={onValuesChange}
          onFinish={onFinish}
          submitEmitter={submitEmitter}
        />
      ),
      afterClose: () => {
        WindowsService.updateStyleBlockers(Utils.getWindowId(), false);
      },
      onOk: () => {
        submitEmitter.next();
        return true;
      },
    });
    fixBodyWidth();
  });
}

export function promptAction(p: {
  title: string;
  message: string;
  btnText: string;
  fn(): void | ((props: any) => unknown | void);
  icon?: React.ReactNode;
}) {
  alertAsync({
    bodyStyle: { padding: '24px' },
    className: styles.actionModal,
    type: 'confirm',
    title: p.title,
    content: p.message,
    icon: p?.icon,
    closable: true,
    maskClosable: true,
    cancelButtonProps: { style: { display: 'none' } },
    okButtonProps: { style: { display: 'none' } },
    modalRender: node => (
      <ModalLayout
        footer={
          <Form layout={'inline'} className={styles.actionModalFooter}>
            <Button onClick={Modal.destroyAll}>{$t('Skip')}</Button>
            <Button
              type="primary"
              onClick={() => {
                Modal.destroyAll();
                p.fn();
              }}
            >
              {p.btnText}
            </Button>
          </Form>
        }
      >
        {node}
      </ModalLayout>
    ),
    width: 600,
  });
}

export function DefaultPromptForm(
  p: {
    values: { prompt: string };
    submitEmitter: Observable<unknown>;
  } & Pick<FormProps, 'onValuesChange' | 'onFinish'>,
) {
  const form = useForm();

  useEffect(() => {
    const subscription = p.submitEmitter.subscribe(() => {
      onFinish();
    });
    return () => subscription.unsubscribe();
  });

  function onChange(newVal: string) {
    const values = { prompt: newVal };
    p.onValuesChange && p.onValuesChange(values, values);
  }

  async function onFinish() {
    try {
      await form.validateFields();
      p.onFinish && p.onFinish(p.values);
    } catch (e: unknown) {}
  }

  return (
    <Form name="prompt" form={form}>
      <TextInput name="prompt" value={p.values.prompt} onChange={onChange} nowrap />
    </Form>
  );
}

/**
 * The Antd lib adds additional styles to body most likely to handle scrollbars
 * these styles add additional width that makes the window looks junkie
 * Just remove these styles with this function after each modal show
 */
function fixBodyWidth() {
  setTimeout(() => {
    document.querySelector('body')!.setAttribute('style', '');
  });
}
