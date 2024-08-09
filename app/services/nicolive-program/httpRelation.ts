import { HttpRelationState } from './state';
import { WrappedChat } from './WrappedChat';
import uuid from 'uuid/v4';

type SendParam = {
  id: string;
  comment: string;
  isOwner: string;
  userId: string;
  name: string;
};

export default class HttpRelation {
  static async sendChat(item: WrappedChat, httpRelation: HttpRelationState): Promise<string> {
    const value = item.value;
    if (!value || !value.content) return 'Error no-value';
    const param: SendParam = {
      id: item.value.id ?? uuid(),
      comment: item.value.content ?? '---',
      isOwner: item.type === 'operator' ? 'true' : 'false',
      userId: item.value.user_id ?? '-',
      name: item.value.name ?? '',
    };

    return await this.send(param, httpRelation);
  }

  static async sendTest(httpRelation: HttpRelationState): Promise<string> {
    const param: SendParam = {
      id: uuid(),
      comment: 'テストコメントです',
      isOwner: 'false',
      userId: '-',
      name: 'test',
    };
    return await this.send(param, httpRelation);
  }

  private static async send(param: SendParam, httpRelation: HttpRelationState): Promise<string> {
    if (!httpRelation || !httpRelation.method) return 'Error no-settings';

    const url = httpRelation.url.replace(/{(\w+)}/g, (m, p: keyof SendParam) =>
      encodeURIComponent(param[p] ?? ''),
    );
    const method = httpRelation.method;
    const arg: { [name: string]: any } = { method };
    if (method === 'POST' || method === 'PUT') {
      arg.headers = { 'Content-Type': 'application/json' };
      arg.body = httpRelation.body.replace(/{(\w+)}/g, (m, p: keyof SendParam) => param[p] ?? '');
    }

    try {
      const response = await fetch(url, arg);
      if (!response.ok)
        throw new Error(`Failed to send chat: ${response.status} ${response.statusText}`);
      return await response.text();
    } catch (e) {
      const msg = 'Error ' + e.toString();
      console.warn(msg);
      return msg;
    }
  }
}
