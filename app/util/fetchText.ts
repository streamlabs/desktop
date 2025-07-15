import { ipcRenderer } from 'electron';

/**
 * main process経由でfetchを行う
 */
function fetchViaMainProcess(
  url: string,
  requestInit: RequestInit,
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  headers: { [key: string]: string };
}> {
  return ipcRenderer.invoke('fetchViaMainProcess', url, requestInit);
}

/**
 * Originヘッダーを含むリクエストはメインプロセス経由でfetchする
 */
export async function fetchText(
  url: string,
  requestInit: RequestInit,
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  headers: Headers;
}> {
  const h = new Headers(requestInit.headers);
  const shouldFetchViaMainProcess = h.get('Origin') !== null;
  if (!shouldFetchViaMainProcess) {
    return fetch(url, requestInit);
  }
  const r = await fetchViaMainProcess(url, requestInit);
  return {
    ok: r.ok,
    status: r.status,
    statusText: r.statusText,
    text: () => Promise.resolve(r.text),
    headers: new Headers(r.headers),
  };
}
