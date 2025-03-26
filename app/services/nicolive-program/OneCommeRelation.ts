import { Inject } from 'services/core/injector';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { NicoliveProgramStateService } from 'services/nicolive-program/state';

interface OneCommeServiceData {
  id?: string;
  name?: string;
  url?: string;
  enabled?: boolean;
}

const OneCommeAPI = 'http://localhost:11180/api/';
const NicoLiveBaseURL = 'https://live.nicovideo.jp/watch/';

const OneCommeServiceFixID = '25252525-N-AIR-FIXED';

async function fetchJSON<T>(input: string, init?: RequestInit): Promise<T> {
  return await (await fetch(input, init)).json();
}

export class OneCommeRelation {
  @Inject() nicoliveProgramStateService: NicoliveProgramStateService;
  @Inject() nicoliveProgramService: NicoliveProgramService;

  previousState = '';

  async sendService(data: OneCommeServiceData, removeComment: boolean = true): Promise<boolean> {
    try {
      // 既存設定があればそれを使う
      const item = (await fetchJSON(
        `${OneCommeAPI}services/${OneCommeServiceFixID}`,
      )) as OneCommeServiceData;
      const exist = item && item.id === OneCommeServiceFixID;

      // 番組が異なる場合は既存コメント削除
      if (removeComment && exist && item.url !== data.url) {
        await fetch(`${OneCommeAPI}comments`, { method: 'DELETE' });
      }

      // 更新/作成
      const sendURL = `${OneCommeAPI}services` + (exist ? `/${OneCommeServiceFixID}` : '');

      const arg = {
        method: exist ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };

      const result = (await fetchJSON(sendURL, arg)) as OneCommeServiceData;
      if (!result) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  async update({ force }: { force: boolean } = { force: false }): Promise<boolean> {
    if (!this.nicoliveProgramStateService.state.onecommeRelation.use) return false;
    const programID = this.nicoliveProgramService.state.programID;
    if (!programID) return false;

    if (force) this.previousState = '';
    const state = this.nicoliveProgramService.state.status;
    if (!state || state === this.previousState) return false;
    this.previousState = state;
    //  status: 'reserved' | 'test' | 'onAir' | 'end';

    const data: OneCommeServiceData = {
      id: OneCommeServiceFixID,
      url: `${NicoLiveBaseURL}${programID}`,
      enabled: state === 'onAir' || state === 'test',
      name: '#N_Air',
    };

    const removeComment = this.nicoliveProgramStateService.state.onecommeRelation.removeComment;
    return await this.sendService(data, removeComment);
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await fetchJSON(`${OneCommeAPI}info`);
      if (!result) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
}
