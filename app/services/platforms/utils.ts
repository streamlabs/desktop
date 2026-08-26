import type { IPlatformRequest, TPlatform } from './index';
import { jfetch } from '../../util/requests';

export interface IPlatformResponse<TResult = unknown> {
  ok: boolean;
  url: string;
  status: number;
  result: TResult;
  message: string;
}

export interface IPlatformRequestFailureDiagnostic {
  platform: TPlatform;
  method: string;
  status?: number;
  reason?: string;
}

function sanitizedHttpMethod(reqInfo: IPlatformRequest | string): string {
  if (typeof reqInfo === 'string' || typeof reqInfo.method !== 'string') return 'GET';
  const method = reqInfo.method.trim();
  return /^[A-Za-z]{1,16}$/.test(method) ? method.toUpperCase() : 'UNKNOWN';
}

function sanitizedHttpStatus(error: unknown): number | undefined {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : undefined;
}

function sanitizedApiReason(platform: TPlatform, error: unknown): string | undefined {
  if (platform !== 'youtube') return undefined;
  const reason = (error as any)?.result?.error?.errors?.[0]?.reason;
  return typeof reason === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(reason)
    ? reason
    : undefined;
}

/**
 * Build a credential-free platform failure diagnostic. Deliberately omit the
 * URL, headers, request/response bodies, and arbitrary server messages because
 * they can contain tokens, stream credentials, identifiers, or user content.
 */
export function sanitizePlatformRequestFailure(
  platform: TPlatform,
  reqInfo: IPlatformRequest | string,
  error: unknown,
): IPlatformRequestFailureDiagnostic {
  const status = sanitizedHttpStatus(error);
  const reason = sanitizedApiReason(platform, error);
  return {
    platform,
    method: sanitizedHttpMethod(reqInfo),
    ...(status ? { status } : {}),
    ...(reason ? { reason } : {}),
  };
}

/**
 * same as handleResponse but passes a Response object instead a response body
 * in the case of Promise rejection
 * @see handleResponse
 */
export async function handlePlatformResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  let result: unknown;
  try {
    // Youtube API can return an empty content for a 'DELETE' request even if the content-type is application/json
    result = await (isJson ? response.json() : response.text());
  } catch (e: unknown) {
    result = '';
  }
  const serializedResponse = { ok: response.ok, url: response.url, status: response.status };
  return response.ok
    ? result
    : Promise.reject({ result, message: status, ...serializedResponse } as IPlatformResponse);
}

/**
 * make a request to the platform API
 * ensure correct headers for each platform and retry fetching in case
 * if the token has been outdated
 * @param useToken true|false or a token string
 * @param useJfetch Default true, pass false to use normal fetch API and
 * receive a Response object instead. This is needed if you want to view
 * response headers or other advanced use cases.
 */
export async function platformRequest<T = unknown>(
  platform: TPlatform,
  reqInfo: IPlatformRequest | string,
  useToken: boolean | string,
  useJfetch: false,
): Promise<Response>;
export async function platformRequest<T = unknown>(
  platform: TPlatform,
  reqInfo: IPlatformRequest | string,
  useToken: boolean | string,
  useJfetch: true,
): Promise<T>;
export async function platformRequest<T = unknown>(
  platform: TPlatform,
  reqInfo: IPlatformRequest | string,
  useToken?: boolean | string,
): Promise<T>;
export async function platformRequest<T = unknown>(
  platform: TPlatform,
  reqInfo: IPlatformRequest | string,
  useToken: boolean | string = false,
  useJfetch: boolean = true,
): Promise<T | Response> {
  const req: IPlatformRequest = typeof reqInfo === 'string' ? { url: reqInfo } : reqInfo;
  // Load the registry only when performing a request. Keeping the pure
  // diagnostic helper independent from the platform service graph also avoids
  // initializing unrelated providers when tooling needs to sanitize an error.
  const { getPlatformService } = require('./index') as typeof import('./index');
  const platformService = getPlatformService(platform);

  // create a request function with required headers
  const requestFn: () => Promise<T | Response> = () => {
    const headers = new Headers(
      platformService.getHeaders(req, useToken) as Record<string, string>,
    );
    const request = new Request(req.url, { ...req, headers });

    if (useJfetch) {
      return jfetch(request) as Promise<T>;
    } else {
      return fetch(request).then(response => {
        if (!response.ok) throw response;
        return response;
      });
    }
  };

  // Try once more with a refreshed token after a 401. Log only the terminal
  // failure so a failed retry retains its useful status/reason diagnostic too.
  try {
    return await requestFn();
  } catch (error: unknown) {
    if (useToken && (error as { status?: unknown } | null)?.status === 401) {
      try {
        await platformService.fetchNewToken();
      } catch (refreshError: unknown) {
        // The request itself received an authoritative 401 and no retry was
        // attempted. Preserve that outcome for callers that distinguish a
        // rejected resource creation from an ambiguous transport failure.
        console.log(
          'Failed platform request',
          sanitizePlatformRequestFailure(platform, req, error),
        );
        throw error;
      }
      try {
        return await requestFn();
      } catch (retryError: unknown) {
        // A refreshed request was actually sent, so its outcome supersedes the
        // initial authentication rejection.
        console.log(
          'Failed platform request',
          sanitizePlatformRequestFailure(platform, req, retryError),
        );
        throw retryError;
      }
    }
    console.log('Failed platform request', sanitizePlatformRequestFailure(platform, req, error));
    throw error;
  }
}

/**
 * Make an authorized request to the platform API
 * This is a shortcut for platformRequest()
 * @see platformRequest
 */
export function platformAuthorizedRequest<T = unknown>(
  platform: TPlatform,
  req: IPlatformRequest | string,
): Promise<T> {
  return platformRequest(platform, req, true);
}
