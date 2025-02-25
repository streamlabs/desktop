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

const OneCommeServiceURL = 'http://localhost:11180/api/services';
const NicoLiveBaseURL = 'https://live.nicovideo.jp/watch/';

export class OneCommeRelation {
  @Inject() nicoliveProgramStateService: NicoliveProgramStateService; // 設定値の予定
  @Inject() nicoliveProgramService: NicoliveProgramService; //状態の取得

  oneCommeID = '';

  async upsert(enabled: boolean): Promise<boolean> {
    try {
      const programID = this.nicoliveProgramService.state.programID;
      if (!programID) return;

      // 既存設定があればそれを使う
      if (!this.oneCommeID) {
        const list = (await (await fetch(OneCommeServiceURL)).json()) as OneCommeBody[];

        if (Array.isArray(list) && list.length > 0) {
          const item = list.find(item => item.url && item.url.startsWith(NicoLiveBaseURL));
          if (item && item.id) this.oneCommeID = item.id;
        }
      }

      // 更新/作成
      const sendURL = OneCommeServiceURL + (this.oneCommeID ? `/${this.oneCommeID}` : '');
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

      const result = (await (await fetch(sendURL, arg)).json()) as OneCommeBody;
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
}
