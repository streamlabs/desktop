import { ipcRenderer } from 'electron';

/** main process の IPC 'fetch' の返り値
 */
export type MainProcessFetchResponse = {
  ok: boolean;
  headers: [string, string][];
  status: number;
  text: string;
};

export function fetchViaMainProcess(
  url: string,
  init: RequestInit,
): Promise<MainProcessFetchResponse> {
  return ipcRenderer.invoke('fetch', url, init);
}
