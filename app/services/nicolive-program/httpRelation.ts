import uuid from 'uuid';
import { ChatMessageType } from './ChatMessage/classifier';
import { getDisplayText } from './ChatMessage/displaytext';
import { HttpRelationState } from './state';
import { isWrappedChat, WrappedMessageWithComponent } from './WrappedChat';

type SendParam = {
  id: string;
  comment: string;
  isOwner: string;
  userId: string;
  name: string;
  isPremium: string;
  isAnonymous: string;
  type: ChatMessageType;
};

export type HttpRelationResult =
  | {
      error: string;
    }
  | {
      result: string;
    };

export class HttpRelation {
  static async sendChat(
    item: WrappedMessageWithComponent,
    httpRelation: HttpRelationState,
  ): Promise<HttpRelationResult> {
    if (!item.value || !item.type) return { error: 'no-value' };

    const bool2string = (b: any) => (b ? 'true' : 'false');

    const param: SendParam = {
      id: '',
      comment: '',
      isOwner: '',
      userId: '',
      name: '',
      isPremium: '',
      isAnonymous: '',
      type: item.type,
    };

    if (isWrappedChat(item)) {
      if (!item.value.content) return { error: 'no-content' };
      param.id = item.value.id ?? uuid();
      param.comment = item.value.content;
      param.isOwner = bool2string(item.type === 'operator');
      param.userId = item.value.user_id ?? '-';
      param.name = item.value.name ?? '';
      param.isPremium = bool2string(item.value.premium);
      param.isAnonymous = bool2string(item.value.anonymity);
    } else {
      const comment = getDisplayText(item);
      if (!comment) return { error: 'no-comment' };
      param.comment = comment;
    }

    return await this.send(param, httpRelation);
  }

  static async sendTest(httpRelation: HttpRelationState): Promise<HttpRelationResult> {
    const param: SendParam = {
      id: uuid(),
      comment: 'テストコメントです',
      isOwner: 'false',
      userId: '-',
      name: 'test',
      isPremium: 'true',
      isAnonymous: 'false',
      type: 'normal',
    };
    return await this.send(param, httpRelation);
  }

  private static async send(
    param: SendParam,
    httpRelation: HttpRelationState,
  ): Promise<HttpRelationResult> {
    if (!httpRelation || !httpRelation.method) return { error: 'no-settings' };

    const url = httpRelation.url.replace(/{(\w+)}/g, (m, p: keyof SendParam) =>
      encodeURIComponent(param[p] ?? ''),
    );
    const method = httpRelation.method;
    const arg: { [name: string]: any } = { method };
    if (method === 'POST' || method === 'PUT') {
      arg.headers = { 'Content-Type': 'application/json' };
      arg.body = httpRelation.body.replace(/{(\w+)}/g, (m, p: keyof SendParam) =>
        (param[p] ?? '').replace(/"/g, '\\"'),
      );
    }
    //console.log('sendChat', url, arg); // DEBUG

    try {
      const response = await fetch(url, arg);
      if (!response.ok) {
        return { error: `status=${response.status}` };
      }
      return { result: await response.text() };
    } catch (e) {
      return { error: e.toString() };
    }
  }

  static async sendLog(programID: string, uuid: string, httpRelation: HttpRelationState) {
    try {
      if (!programID || !httpRelation) return;
      const url = 'https://dcdn.cdn.nicovideo.jp/shared_httpd/log.gif';
      const params = new URLSearchParams();
      params.append('frontend_id', '134');
      params.append('id', 'http_relation');
      params.append('content_id', programID);
      params.append('uuid', uuid);
      params.append('method', httpRelation.method);
      params.append('url', httpRelation.url);

      await fetch(`${url}?${params}`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
      });
    } catch (e) {}
  }
}
