import { Inject } from 'services/core/injector';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { NicoliveProgramStateService } from 'services/nicolive-program/state';
import uuid from 'uuid';

interface OneCommeBody {
  id?: string;
  name?: string;
  url?: string;
  enabled?: boolean;
}

const OneCommeURL = 'http://localhost:11180/api/';
const NicoLiveBaseURL = 'https://live.nicovideo.jp/watch/';

async function fetchJSON<T>(input: string, init?: RequestInit): Promise<T> {
  return await (await fetch(input, init)).json();
}

export class OneCommeRelation {
  @Inject() nicoliveProgramStateService: NicoliveProgramStateService; // 設定値の予定
  @Inject() nicoliveProgramService: NicoliveProgramService; //状態の取得

  oneCommeID = '';

  async upsert(enabled: boolean): Promise<boolean> {
    try {
      if (!this.nicoliveProgramStateService.state.onecommeRelation.use) return false;
      const programID = this.nicoliveProgramService.state.programID;
      if (!programID) return false;

      // 既存設定があればそれを使う
      if (!this.oneCommeID) {
        const list = (await fetchJSON(`${OneCommeURL}services`)) as OneCommeBody[];

        if (Array.isArray(list)) {
          const item = list.find(item => item.url && item.url.startsWith(NicoLiveBaseURL)); //もしくはID固定からの取得
          if (item && item.id) this.oneCommeID = item.id;
        }
      }

      // 更新/作成
      const sendURL = `${OneCommeURL}services` + (this.oneCommeID ? `/${this.oneCommeID}` : '');
      const body: OneCommeBody = {
        id: this.oneCommeID ? this.oneCommeID : uuid(),
        url: `${NicoLiveBaseURL}${programID}`,
        enabled,
        name: '#N Air',
      };

      const arg = {
        method: this.oneCommeID ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      };

      const result = (await fetchJSON(sendURL, arg)) as OneCommeBody;
      if (result && result.id) this.oneCommeID = result.id;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  //  status: 'reserved' | 'test' | 'onAir' | 'end';
  update(state?: string) {
    if (!state) return;
    this.upsert(state === 'onAir');
  }

  static async connectionTest(): Promise<boolean> {
    try {
      const result = await fetchJSON(`${OneCommeURL}info`);
      if (!result) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
}
