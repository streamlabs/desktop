import { Inject } from 'services/core/injector';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { NicoliveProgramStateService } from 'services/nicolive-program/state';

/**
 * OneCommeサービスとのやり取りに使用するデータ構造
 */
interface OneCommeServiceData {
  id?: string;
  name?: string;
  url?: string;
  enabled?: boolean;
}

// APIエンドポイント関連の定数
const OneCommeAPIURL = 'http://localhost:11180/api/';
const NicoLiveBaseURL = 'https://live.nicovideo.jp/watch/';
const OneCommeServiceFixID = '25252525-N-AIR-FIXED';

/**
 * 指定URLからJSONデータを取得する汎用ヘルパー関数
 */
async function fetchJSON<T>(input: string, init?: RequestInit): Promise<T> {
  return await (await fetch(input, init)).json();
}

/**
 * ニコニコ生放送とOneCommeサービスを連携するクラス
 */
export class OneCommeRelation {
  @Inject() nicoliveProgramStateService: NicoliveProgramStateService;
  @Inject() nicoliveProgramService: NicoliveProgramService;

  // 前回の放送状態を記録
  previousState = '';

  /**
   * OneCommeサービスにデータを送信する
   * @param data 送信するサービスデータ
   * @param removeComment コメント削除を行うかどうか
   * @return 処理成功時はtrue、失敗時はfalse
   */
  private async sendService(data: OneCommeServiceData, removeComment = true): Promise<boolean> {
    const makeRequest = (method: string, sendData: OneCommeServiceData) => {
      return {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendData),
      };
    };

    try {
      const serviceUrl = `${OneCommeAPIURL}services`;
      const url = `${serviceUrl}/${OneCommeServiceFixID}`;

      // 既存のサービス設定を取得
      const item = await fetchJSON<OneCommeServiceData>(url);
      const exist = item && item.id === OneCommeServiceFixID;

      // 番組が異なる場合の処理
      if (exist && item.url !== data.url) {
        // 再接続してもらうために一旦接続を切る
        if (item.enabled) {
          await fetchJSON(url, makeRequest('PUT', { enabled: false }));
        }
        // 設定に従って既存コメントを削除
        if (removeComment) {
          await fetch(`${OneCommeAPIURL}comments`, { method: 'DELETE' });
        }
      }

      // 実際の接続に行くには一旦OFFにしてからONにする必要がある
      const originalEnabledState = data.enabled;
      data.enabled = false;
      if (!exist) {
        await fetchJSON<OneCommeServiceData>(serviceUrl, makeRequest('POST', data));
      }
      if (exist && originalEnabledState) {
        await fetchJSON<OneCommeServiceData>(url, makeRequest('PUT', data));
      }
      data.enabled = originalEnabledState;
      // ワンコメのログインが放送者IDの場合はテスト配信時でも取得できるが、それ以外の場合は本配信まで取れない

      // サービス設定を更新
      const result = await fetchJSON<OneCommeServiceData>(url, makeRequest('PUT', data));
      return !!result;
    } catch (e) {
      console.error('OneCommeRelation sendService error', e);
      return false;
    }
  }

  /**
   * 放送状態に基づいてOneCommeサービスを更新する
   * @param options 更新オプション
   * @return 処理成功時はtrue、失敗時はfalse
   */
  async update({ force = false } = {}): Promise<boolean> {
    // OneComme連携が無効な場合は処理しない
    if (!this.nicoliveProgramStateService.state.onecommeRelation.use) return false;

    // 放送IDがない場合は処理しない
    const programID = this.nicoliveProgramService.state.programID;
    if (!programID) return false;

    // 強制更新の場合は前回状態をリセット
    if (force) this.previousState = '';

    // 状態が変化していない場合は処理しない
    const state = this.nicoliveProgramService.state.status;
    if (!state || state === this.previousState) return false;

    // 現在の状態を記録
    this.previousState = state;
    // 放送状態: 'reserved'(予約) | 'test'(テスト配信) | 'onAir'(本配信) | 'end'(終了)

    // OneCommeに送信するデータを準備
    const data: OneCommeServiceData = {
      id: OneCommeServiceFixID,
      url: `${NicoLiveBaseURL}${programID}`,
      enabled: state === 'onAir' || state === 'test', // テスト配信と本配信時のみ有効化
      name: '#N_Air',
    };

    // ユーザー設定に従ってコメント削除処理を行うかどうか
    const removeComment = this.nicoliveProgramStateService.state.onecommeRelation.removeComment;
    return this.sendService(data, removeComment);
  }

  /**
   * OneComme APIへの接続テストを実行する
   * @return 接続成功時はtrue、失敗時はfalse
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await fetchJSON(`${OneCommeAPIURL}info`);
      return !!result;
    } catch (e) {
      return false;
    }
  }
}
