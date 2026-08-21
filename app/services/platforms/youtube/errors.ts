import { endpointErrorTypes, reasonLabels } from './api';
import { IRejectedRequest, TStreamErrorType } from 'services/streaming/stream-error';
import { IPlatformRequest } from '../index';
import { $t } from 'services/i18n';

/**
 * Build the reject request error object.
 * @remark The reason is looked up against the endpoint's own table of documented
 * YouTube reasons first, then against the reasons documented for every endpoint.
 * Anything unrecognised falls back to YouTube's own message so nothing is swallowed.
 */
export function formatErrorRejectedRequest(
  e: any,
  errorType: TStreamErrorType = 'PLATFORM_REQUEST_FAILED',
  reason?: string,
) {
  const details =
    errorType === 'YOUTUBE_THUMBNAIL_UPLOAD_FAILED'
      ? formatThumbnailUploadError(e)
      : formatYoutubeReasonDetail(e, reason);

  const message = e?.result?.error?.errors?.[0]?.message;

  // The error message returned from the YouTube API should also be shown to the user.
  // Because it is being returned directly from the API, this may or may not be translated,
  // but it is the most specific message available so is the most helpful for debugging.
  const statusText = message ? `${details} (${message})` : details;

  const rejectedRequest: IRejectedRequest = {
    ...e,
    platform: 'youtube',
    reason,
    statusText,
  };
  // Updated the rejected request status if it is returned from the YouTube API
  const json = e.result.error;
  if (json) {
    return {
      ...rejectedRequest,
      status: json.status,
    };
  }

  // Otherwise, return the default rejected request
  return rejectedRequest;
}

/**
 * Build the user-facing detail line for a failed request.
 *
 * @remark The reason is looked up against the endpoint's own table of documented
 * YouTube reasons first, then against the reasons documented for every endpoint.
 * Anything unrecognised falls back to YouTube's own message so nothing is swallowed.
 * @param e - the error thrown by the failed request
 * @param errorTypeOrReason - an explicit error type from the caller, otherwise
 * `error.errors[0].reason` from the YouTube response
 * @param endpoint - the endpoint that failed, when it could be resolved from the URL
 */
export function formatErrorDetails(
  e: any,
  errorType: TStreamErrorType = 'PLATFORM_REQUEST_FAILED',
  reason?: string,
): string | undefined {
  // Show custom thumbnail upload errors but for all other api requests, show the error detail
  // returned from the api
  return errorType === 'YOUTUBE_THUMBNAIL_UPLOAD_FAILED'
    ? formatThumbnailUploadError(e)
    : formatYoutubeReasonDetail(e, reason);
}

/**
 * The display label for a YouTube reason code.
 *
 * @param reason - `error.errors[0].reason` from the YouTube response
 * @returns the translated label, or a camelCase split of the reason when it is not in
 * the dictionary
 */
export function formatYoutubeReasonDetail(e: any, reason?: string): string {
  if (!reason) {
    // If no reason was returned from the YouTube API, attempt to handle by status code
    const status = e?.result?.error?.status;
    switch (status) {
      case 423:
        console.error('YouTube API Error 423: YouTube token expired, need to refresh', e);
        return $t('YouTube token expired, please re-merge your account');
      case 503:
        console.error('YouTube API Error 503: YouTube service unavailable', e);
        return $t('YouTube API service unavailable');
      case 403:
        console.error('YouTube API Error 403: Permission denied', e);
        return $t('YouTube permission denied by API');
      default:
        console.error('YouTube API Error ', status, ': Non-generic error', e);
        return $t('Connection Failed');
    }
  }

  // Return the translated label for the reason, or a camelCase split of the reason when it is not in the dictionary
  return (
    reasonLabels[reason] ??
    reason
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/^./, c => c.toUpperCase())
  );
}

export function formatThumbnailUploadError(e: any): string {
  const code = e?.code || e?.status;

  switch (code) {
    case 400: {
      const hasReason = e?.errors && e?.errors.length && e?.errors[0].reason;
      if (hasReason && e.errors[0].reason === 'invalidImage') {
        return $t('Thumbnail image content is invalid.');
      } else if (hasReason && e.errors[0].reason === 'mediaBodyRequired') {
        return $t('Thumbnail file does not include image content.');
      } else {
        return $t('Failed to upload thumbnail.');
      }
    }
    case 403:
      return $t('Permission missing to upload thumbnails.');
    case 413:
      return $t('YouTube thumbnail image is too large. Maximum size is 2MB.');
    case 404:
      return $t('Video does not exist. Thumbnail upload failed.');
    case 429:
      return $t('Exceeded thumbnail upload quota. Please try again later.');
    default:
      return e?.message || $t('Failed to upload thumbnail.');
  }
}

/**
 * The error type for a given endpoint.
 * @param endpoint - the endpoint that failed, or `undefined` if it could not be resolved
 * @returns the endpoint's error type, falling back to PLATFORM_REQUEST_FAILED
 */
export function getYoutubeErrorType(e: any, reqInfo?: IPlatformRequest | string): TStreamErrorType {
  // If the error doesn't have a result or an error object, it's not a YouTube API error response
  // If the url is not a valid YouTube API url, it's not a YouTube API error response
  const url = typeof reqInfo === 'string' ? reqInfo : reqInfo?.url;
  if (!e?.result || !e.result?.error || !url || !url?.includes('/youtube/v3/')) {
    return 'PLATFORM_REQUEST_FAILED';
  }

  // Everything after `/youtube/v3/` and before the query string identifies the endpoint
  const path = url.match(/\/youtube\/v3\/([^?]*)/)?.[1];

  // Map the endpoint to a corresponding error type
  return path ? endpointErrorTypes[path] : 'PLATFORM_REQUEST_FAILED';
}
