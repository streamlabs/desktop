// Helper methods for making HTTP requests
import fs from 'fs';
import crypto from 'crypto';
import humps from 'humps';

/**
 * Passing this function as your first "then" handler when making
 * a request using the fetch API will guarantee that non-success
 * HTTP response codes will result in a rejected promise.  Note that
 * this is NOT the default behavior of the fetch API, so we have to
 * handle it explicitly.
 */
export const handleResponse = (response: Response) => {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const result = isJson ? response.json() : response.text();
  return response.ok ? result : result.then(r => Promise.reject(r));
};

export const handleErrors = (response: Response): Promise<any> => {
  if (response.ok) return Promise.resolve(response);
  return response.json().then(json => Promise.reject(json));
};

/**
 * transforms response keys to lowerCamelCase
 * helps to keep consistent code style in the project
 */
export function camelize(response: Response): Promise<any> {
  return new Promise(resolve => {
    return response.json().then((json: object) => {
      resolve(humps.camelizeKeys(json));
    });
  });
}

/**
 * Generates authorized headers per the OAuth standard.  If headers
 * are not passed, new headers will be generated.
 * @param token the OAuth access token
 * @param headers headers to append to
 */
export function authorizedHeaders(token: string | undefined, headers = new Headers()): Headers {
  if (token) headers.append('Authorization', `Bearer ${token}`);
  return headers;
}

export interface IDownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percent: number;
}

export async function downloadFile(
  srcUrl: string,
  dstPath: string,
  progressCallback?: (progress: IDownloadProgress) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    return fetch(srcUrl)
      .then(resp => (resp.ok ? Promise.resolve(resp) : Promise.reject(resp)))
      .then(response => {
        const contentLength = response.headers.get('content-length');
        const totalSize = parseInt(contentLength, 10);
        const reader = response.body.getReader();
        const fileStream = fs.createWriteStream(dstPath);
        let bytesWritten = 0;

        const readStream = ({ done, value }: { done: boolean; value?: Uint8Array }) => {
          if (done) {
            fileStream.end((err: Error) => {
              if (err) {
                reject(err);
                return;
              }

              // Final progress callback is emitted regardless of whether
              // we got a content-length header.
              if (progressCallback) {
                progressCallback({
                  totalBytes: totalSize || 0,
                  downloadedBytes: totalSize || 0,
                  percent: 1,
                });
              }
              resolve();
            });
          } else {
            bytesWritten += value.byteLength;
            fileStream.write(value);
            reader.read().then(readStream);

            // Only do intermediate progress callbacks if we received the
            // content-length header in the response
            if (progressCallback && totalSize) {
              progressCallback({
                totalBytes: totalSize,
                downloadedBytes: bytesWritten,
                percent: bytesWritten / totalSize,
              });
            }
          }
        };

        return reader.read().then(readStream);
      })
      .catch(e => reject(e));
  });
}

export const isUrl = (x: string): boolean => !!x.match(/^https?:/);

export function getChecksum(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const file = fs.createReadStream(filePath);
    const hash = crypto.createHash('md5');

    file.on('data', data => hash.update(data));
    file.on('end', () => resolve(hash.digest('hex')));
    file.on('error', e => reject(e));
  });
}

interface IJfetchOptions {
  /**
   * If true, will force parsing of JSON even when the server
   * does not respond with the appropriate content-type header.
   * This is useful when requesting files from a CDN rather than
   * calling an API.
   */
  forceJson?: boolean;
}

export function jfetch<TResponse = unknown>(
  request: RequestInfo,
  init?: RequestInit,
  options: IJfetchOptions = {},
): Promise<TResponse> {
  return fetch(request, init).then(response => {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    if (response.ok) {
      if (isJson || options.forceJson) {
        return response.json() as Promise<TResponse>;
      } else {
        console.warn(`jfetch: Got non-JSON response ${response.status} from ${response.url}`);
        return (response.text() as unknown) as Promise<TResponse>;
      }
    } else if (isJson) {
      return throwJsonError(response);
    } else {
      throw response;
    }
  });
}

function throwJsonError(response: Response): Promise<never> {
  return new Promise((res, rej) => {
    response.json().then((json: unknown) => {
      rej({
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        result: json,
      });
    });
  });
}
