import * as Sentry from '@sentry/vue';
import { FailedResult, NotLoggedInError } from './NicoliveClient';
import { $t } from 'services/i18n';
import * as remote from '@electron/remote';

export class NicoliveFailure {
  constructor(
    public type: 'logic' | 'http_error' | 'network_error',
    public method: string,
    public reason: string,
    public additionalMessage: string = '',
    public errorCode: string = '',
  ) {}

  static fromClientError(method: string, res: FailedResult) {
    if (res.value instanceof NotLoggedInError) {
      console.error(res.value);
      return new this('logic', method, 'not_logged_in');
    }
    if (res.value instanceof Error) {
      console.error(res.value);
      return new this('network_error', method, 'network_error');
    }
    const { errorCode, errorMessage } = res.value.meta;
    const additionalMessage = `${errorCode ?? ''}${errorMessage ? `: ${errorMessage}` : ''}`;
    return new this(
      'http_error',
      method,
      res.value.meta.status.toString(10),
      additionalMessage,
      errorCode,
    );
  }

  static fromConditionalError(method: string, reason: string) {
    return new this('logic', method, reason);
  }
}

async function openErrorDialog({
  title,
  message,
}: {
  title: string;
  message: string;
}): Promise<void> {
  return new Promise<void>(resolve => {
    remote.dialog
      .showMessageBox(remote.getCurrentWindow(), {
        type: 'warning',
        title,
        message,
        buttons: [$t('common.close')],
        noLink: true,
      })
      .then(() => resolve());
  });
}

function fallbackToX00(reason: string): string {
  const matched = reason.match(/^(\d)\d\d$/);
  if (matched) {
    return `${matched[1]}00`;
  }
  return reason;
}

export async function openErrorDialogFromFailure(failure: NicoliveFailure): Promise<void> {
  Sentry.withScope(scope => {
    scope.setLevel('warning');
    scope.setExtra('failure', failure);
    scope.setTag('module', 'nicolive-program');
    scope.setTag('function', 'openErrorDialogFromFailure');
    scope.setTag('failure.type', failure.type);
    scope.setTag('failure.method', failure.method);
    scope.setTag('failure.reason', failure.reason);
    scope.setFingerprint(['openErrorDialogFromFailure']);
    Sentry.captureMessage(`openErrorDialogFromFailure`);
  });

  if (failure.type === 'logic') {
    return openErrorDialog({
      title: $t(`nicolive-program.errors.logic.${failure.method}.${failure.reason}.title`),
      message: $t(`nicolive-program.errors.logic.${failure.method}.${failure.reason}.message`),
    });
  }

  // errorCode, status code(4xx, 5xx) -> status code(400, 500) の順で探索するfallback chain を構築する
  const fallbackChain = [
    failure.errorCode ? failure.errorCode : undefined,
    failure.reason,
    fallbackToX00(failure.reason),
  ];
  const buildMessage = (
    key: string,
    params: { additionalMessage?: string } = {},
    index: number = 0,
  ): string | undefined => {
    if (index >= fallbackChain.length) {
      return undefined;
    }
    if (fallbackChain[index] === undefined) {
      return buildMessage(key, params, index + 1);
    }
    return $t(`nicolive-program.errors.api.${failure.method}.${fallbackChain[index]}.${key}`, {
      ...params,
      fallback: buildMessage(key, params, index + 1),
    });
  };
  return openErrorDialog({
    title: buildMessage('title'),
    message: buildMessage('message', { additionalMessage: failure.additionalMessage }),
  });
}
