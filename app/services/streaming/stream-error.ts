import { getPlatformService, TPlatform } from '../platforms';
import { $t } from 'services/i18n';
import { Services } from '../../components-react/service-provider';
import { IOBSOutputSignalInfo } from './streaming';
import { capitalize } from 'lodash';

// the `message` is shown to the user in the error notification
// the `action` is included in the diag report for further specificity
// about the error for debugging and support
export const errorTypes = {
  PLATFORM_REQUEST_FAILED: {
    get message() {
      return $t('The request to the platform failed');
    },
  },
  TWITCH_MISSED_OAUTH_SCOPE: {
    get message() {
      return $t('Missing required oauth scope');
    },
  },
  TWITCH_BANNED_WORDS: {
    get message() {
      return $t('Your stream title or description contain banned words');
    },
  },
  PREPOPULATE_FAILED: {
    get message() {
      return $t('Failed to fetch platform settings');
    },
    get action() {
      return $t('error most likely occurred before going live');
    },
  },
  SETTINGS_UPDATE_FAILED: {
    get message() {
      return $t('Failed to update platform settings');
    },
  },
  RESTREAM_DISABLED: {
    get message() {
      return $t('The Multistream server is temporarily unavailable');
    },
  },
  RESTREAM_SETUP_FAILED: {
    get message() {
      return $t('Failed to configure the Multistream server');
    },
  },
  DUAL_OUTPUT_RESTREAM_DISABLED: {
    get message() {
      return $t('The Multistream server is temporarily unavailable for Dual Output');
    },
  },
  DUAL_OUTPUT_SETUP_FAILED: {
    get message() {
      return $t('Failed to configure the Dual Output service');
    },
  },
  YOUTUBE_STREAMING_DISABLED: {
    get message() {
      return $t('Your YouTube account is not enabled for live streaming');
    },
  },
  YOUTUBE_THUMBNAIL_UPLOAD_FAILED: {
    get message() {
      return $t('Failed to upload the thumbnail');
    },
  },
  FACEBOOK_STREAMING_DISABLED: {
    get message() {
      return $t(
        "You're not eligible to Go Live, your profile needs to be at least 60 days old and your page needs to have at least 100 followers",
      );
    },
  },
  TIKTOK_OAUTH_EXPIRED: {
    get message() {
      return $t('Failed to authenticate with TikTok, re-login or re-merge TikTok account');
    },
  },
  TIKTOK_SCOPE_OUTDATED: {
    get message() {
      return $t(
        'Failed to update TikTok account. Please unlink and reconnect your TikTok account.',
      );
    },
    get action() {
      return $t('unlink and re-merge TikTok account, then restart Desktop');
    },
  },
  TIKTOK_STREAM_SCOPE_MISSING: {
    get message() {
      return $t('Your TikTok account is not enabled for live streaming');
    },
    get action() {
      return $t('confirm Live Access status with TikTok');
    },
  },
  TIKTOK_STREAM_ACTIVE: {
    get message() {
      return $t('You are already live on a another device');
    },
    get action() {
      return $t('end stream on other device to start');
    },
  },
  TIKTOK_GENERATE_CREDENTIALS_FAILED: {
    get message() {
      return $t('Failed to generate TikTok stream credentials. Confirm Live Access with TikTok.');
    },
  },
  TIKTOK_USER_BANNED: {
    get message() {
      return $t('Failed to generate TikTok stream credentials. Confirm Live Access with TikTok.');
    },
    get action() {
      return $t(
        'user might be blocked from streaming to TikTok but do not say they are. Refer them to TikTok',
      );
    },
  },
  X_PREMIUM_ACCOUNT_REQUIRED: {
    get message() {
      return $t('You need X premium account to go live on X.');
    },
  },
  KICK_SCOPE_OUTDATED: {
    get message() {
      return $t('Failed to update Kick account. Please unlink and reconnect your Kick account.');
    },
    get action() {
      return $t('unlink and re-merge Kick account, then restart Desktop');
    },
  },
  KICK_START_STREAM_FAILED: {
    get message() {
      return $t('Failed to start Kick stream. Please check permissions with Kick and try again');
    },
    get action() {
      return $t(
        'Kick request most likely failed due to incorrect or missing permissions. Unlink and re-merge Kick account, then restart Desktop. If that fails, refer to Kick support',
      );
    },
  },
  KICK_STREAM_KEY_MISSING: {
    get message() {
      return $t('Kick stream key failed to generate due to missing permissions');
    },
    get action() {
      return $t(
        'confirm that a stream key has been generated with 2FA on Kick for use with Streamlabs Desktop and if not ask the user to manually generate one',
      );
    },
  },
  PRIME_REQUIRED: {
    get message() {
      return $t('This feature is for Ultra members only');
    },
  },
  MACHINE_LOCKED: {
    get message() {
      return $t('Your computer is locked');
    },
  },
  LOGGED_OUT_ERROR: {
    get message() {
      return $t(
        'You are currently logged out. Please log in or confirm your server url and stream key',
      );
    },
    get action() {
      return $t('user probably has an invalid server url or stream key');
    },
  },
  UNKNOWN_STREAMING_ERROR_WITH_MESSAGE: {
    get message() {
      return $t('Unknown error, please contact support');
    },
    get action() {
      return $t(
        'request rejected by streaming platform. If error shows the user is blocked, do not say that they are blocked but instead ask them to confirm their streaming status with the platform',
      );
    },
  },
  UNKNOWN_STREAMING_ERROR: {
    get message() {
      return $t('Unknown error with no further details, please contact support');
    },
    get action() {
      return $t(
        'request rejected by streaming platform with no other details provided. Confirm go live settings, streaming approval status and output settings',
      );
    },
  },
  UNKNOWN_ERROR: {
    // show this error if we caught a runtime error
    // we should treat this error as a bug in the codebase
    get message() {
      return $t('An unknown error occurred');
    },
    get action() {
      return $t('escalate to the engineering team');
    },
  },
};
export type TStreamErrorType = keyof typeof errorTypes;
const newCallProtector = Symbol('singleton');

export interface IRejectedRequest {
  url?: string;
  status?: number;
  statusText?: string;
  platform?: TPlatform;
}

export interface IStreamError extends IRejectedRequest {
  message: string;
  platform?: TPlatform;
  type: TStreamErrorType;
  details?: string;
  action?: string;
}

interface IErrorMessages {
  user: string;
  report: string;
  details?: string;
}

export class StreamError extends Error implements IRejectedRequest {
  public type: TStreamErrorType;
  public details?: string;
  public url?: string;
  public status?: number;
  public statusText?: string;
  public platform?: TPlatform;

  /**
   * returns serializable representation of the error
   */
  public getModel = () => {
    return {
      type: this.type,
      message: this.message,
      details: this.details,
    };
  };

  constructor(
    message: string,
    type: TStreamErrorType,
    rejectedRequest?: IRejectedRequest,
    details?: string,
    protector?: typeof newCallProtector,
  ) {
    super(message);
    this.message = message;
    this.type = type;
    this.details = details || '';
    this.url = rejectedRequest?.url;
    this.status = rejectedRequest?.status;
    this.statusText = rejectedRequest?.statusText;
    this.platform = this.url ? getPlatform(this.url) : undefined;

    // TODO: remove sensitive data from YT requests
    if (this.platform === 'youtube') {
      this.url = '';
    }

    // don't allow to call 'new' outside this file
    if (protector !== newCallProtector) {
      throw new Error('Use createStreamError() instead "new StreamError()"');
    }
  }
}

function getPlatform(url: string): TPlatform | undefined {
  const platforms = Services.StreamingService.views.linkedPlatforms;
  return platforms.find(platform => url.startsWith(getPlatformService(platform).apiBase));
}

/**
 * create StreamError object extended from Error (has callstack)
 */
export function createStreamError(
  type: TStreamErrorType,
  rejectedRequest?: IRejectedRequest,
  details?: string,
): StreamError {
  return new StreamError(
    errorTypes[type].message,
    type,
    rejectedRequest,
    details,
    newCallProtector,
  );
}

/**
 * a shortcut for "throw new StreamError()"
 */
export function throwStreamError(
  type: TStreamErrorType,
  rejectedRequest?: IRejectedRequest,
  details?: string,
): never {
  throw createStreamError(type, rejectedRequest, details);
}

export function formatStreamErrorMessage(
  errorTypeOrError?: TStreamErrorType | StreamError,
  target?: string,
): IErrorMessages {
  const messages = {
    user: [] as string[],
    report: [] as string[],
  };
  if (typeof errorTypeOrError === 'object') {
    // if an error object has been passed as a first arg
    let message = errorTypeOrError?.message;
    const details = errorTypeOrError?.details;
    const code = errorTypeOrError?.status;
    const error = errorTypes[errorTypeOrError.type ?? 'UNKNOWN_STREAMING_ERROR_WITH_MESSAGE'];

    // never show blocked message to user
    if (!message || (message && message.split(' ').includes('blocked'))) {
      message = error.message;
    }
    messages.user.push(message);

    if (details && !details.split(' ').includes('blocked')) {
      messages.user.push(details);
    }

    message = error.message.replace(/\.*$/, '');
    // trim trailing periods so that the message joins correctly
    const errorMessage = (error as any)?.action ? `${message}, ${(error as any).action}` : message;

    messages.report.push(errorMessage);
    if (details) messages.report.push(details);
    if (code) messages.report.push($t('Error Code: %{code}', { code }));
  } else {
    const typedMessages = createDefaultUnknownMessage(messages, errorTypeOrError, target);
    messages.user = typedMessages.user;
    messages.report = typedMessages.report;
  }

  return {
    user: messages.user.join('. '),
    report: messages.report.join('. '),
  };
}

function createDefaultUnknownMessage(
  messages: { user: string[]; report: string[] },
  errorTypeOrError?: TStreamErrorType,
  target?: string,
) {
  const errorType = errorTypeOrError ?? 'UNKNOWN_STREAMING_ERROR';
  const error = errorTypes[errorType];
  const message = target ? `Unknown ${capitalize(target)} Error: ${error.message}` : error.message;

  // user only sees the message
  messages.user.push(message);

  // add any follow-up actions, if they exist
  const reportMessage = (error as any)?.action ? `${message}, ${(error as any).action}` : message;
  messages.report.push(reportMessage);

  return messages;
}

/**
 * Format error messages for unknown streaming errors
 * @param info - IOBSOutputSignalInfo
 */
export function formatUnknownErrorMessage(
  info: IOBSOutputSignalInfo | string,
  userMessage: string,
  reportMessage: string,
): IErrorMessages {
  const messages = {
    user: userMessage !== '' ? [userMessage] : [],
    report: reportMessage !== '' ? [reportMessage] : [],
    details: [] as string[],
  };

  if (typeof info === 'string') {
    messages.report.push(errorTypes['UNKNOWN_STREAMING_ERROR_WITH_MESSAGE'].message);
    try {
      // if the info is JSON, attempt to parse it
      JSON.parse(info);

      // if it's JSON, don't show it to the user but add to diag report
      messages.user.push(errorTypes['UNKNOWN_STREAMING_ERROR_WITH_MESSAGE'].message);
      messages.report.push($t('JSON returned, escalate to the engineering team.'));
    } catch (error: unknown) {
      // if it's not JSON, it is the message itself
      // don't show blocked message to user
      if (info.split(' ').includes('blocked')) {
        messages.user.push(errorTypes['UNKNOWN_STREAMING_ERROR_WITH_MESSAGE'].message);
        messages.user.push(info);
      } else {
        messages.user.push(info);
      }

      // always add non-JSON info to diag report
      messages.report.push(info);
    }
  } else if (typeof info === 'object') {
    if (info?.error) {
      try {
        // TODO: we wanna refactor this, at least extract, and we should definitely fix types in the future
        // ref: IOBSOutputSignalInfo
        let error;
        let platform;

        if (typeof info.error === 'string' && info.error !== '') {
          /*
           * Try to parse error as JSON as originally done, however, if it's just a string
           * (such as in the case of invalid path and many other unknown -4 errors we've
           * swallowed, use that message instead.
           * We intentionally skip all the logic below this point
           */
          try {
            error = JSON.parse(info.error) as {
              code: string;
              message: string;
              platform: string;
              details: string;
            };
            platform = error.platform ? capitalize(error?.platform) : undefined;
          } catch {
            return obsStringErrorAsMessages(info);
          }
        } else {
          error = (info.error as any) as {
            code: string;
            message: string;
            platform: string;
            details: string;
          };
          platform = capitalize(error.platform);
        }

        /* All of the below deals with correct JSON, which is what we were doing before and where the platform
         * errors are?
         */
        const unknownError = errorTypes['UNKNOWN_STREAMING_ERROR_WITH_MESSAGE'];

        const userMessage = platform
          ? $t('Streaming to %{platform} is temporary unavailable', { platform })
          : unknownError.message;
        const reportMessage = platform
          ? `System Error Streaming to ${platform}: ${unknownError.message}, ${unknownError.action}`
          : `System Error: ${unknownError.message}, ${unknownError.action}`;

        messages.user.push(userMessage);
        messages.report.push(reportMessage);

        if (error.message) {
          if (!error.message.split(' ').includes('blocked')) {
            messages.details.push(error.message);
          }
          messages.report.push(error.message);
        }

        if (error.details) {
          if (!error.details.split(' ').includes('blocked')) {
            messages.details.push(error.details);
          }
          messages.report.push(error.details);
        }

        if (error.code) {
          const code = error.code;
          const message = $t('Error Code: %{code}', { code });
          messages.details.push(message);
          messages.report.push(message);
        }
      } catch (error: unknown) {
        const typedMessages = createDefaultUnknownMessage(
          messages,
          'UNKNOWN_STREAMING_ERROR_WITH_MESSAGE',
        );
        messages.user = typedMessages.user;
        messages.report = typedMessages.report;
      }
    }
  } else {
    const typedMessages = createDefaultUnknownMessage(messages, 'UNKNOWN_STREAMING_ERROR');
    messages.user = typedMessages.user;
    messages.report = typedMessages.report;
  }

  const details = messages.details.length ? messages.details.join('. ') : undefined;
  return {
    user: messages.user.join('. '),
    report: messages.user.join('. '),
    details,
  };
}

function obsStringErrorAsMessages(info: { error: string; code: number }) {
  const error = { message: info.error, code: info.code };

  const diagText = `${error.code} Error: ${error.message}`;
  let userText;

  // TODO: This doesn't work across locales, I know we want this custom text but it's complicating stuff
  const invalidPath = /Unable to write to (.+). Make sure you're using a recording path which your user account is allowed to write to/;
  if (invalidPath.test(error.message)) {
    userText = `${error.message}\n\n${$t(
      'Go to Settings -> Output -> Recording -> Recording Path if you need to change this location.',
    )}`;
  } else {
    // Forward all errors without parsed `details` field (not sure where OBS sends JSON as info.error)
    userText = `${$t(
      'An error occurred with the output. Please check your streaming and recording settings.',
    )}\n\n${error.message}`;
  }

  return {
    user: userText,
    report: diagText,
  };
}
