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
  static async sendChat(item: WrappedChat, httpRelation: HttpRelationState) {
    const value = item.value;
    if (!value || !value.content) return;
    const param: SendParam = {
      id: item.value.id ?? uuid(),
      comment: item.value.content ?? '---',
      isOwner: item.type === 'operator' ? 'true' : 'false',
      userId: item.value.user_id ?? '-',
      name: item.value.name ?? '',
    };

    await this.send(param, httpRelation);
  }

  static async sendTest(httpRelation: HttpRelationState) {
    const param: SendParam = {
      id: uuid(),
      comment: 'テストコメントです',
      isOwner: 'false',
      userId: '-',
      name: 'test',
    };
    await this.send(param, httpRelation);
  }

  private static async send(param: SendParam, httpRelation: HttpRelationState) {
    if (!httpRelation || !httpRelation.method) return;

    const url = httpRelation.url.replace(/{(\w+)}/g, (m, p: keyof SendParam) =>
      encodeURIComponent(param[p] ?? ''),
    );
    const method = httpRelation.method.toString();
    const arg: { [name: string]: any } = {
      method,
    };
    if (method === 'POST' || method === 'PUT') {
      arg.headers = { 'Content-Type': 'application/json' };
      arg.body = httpRelation.body.replace(/{(\w+)}/g, (m, p: keyof SendParam) => param[p] ?? '');
    }

    const response = await fetch(url, arg);
    if (!response.ok) {
      console.warn(`Failed to send chat: ${response.status} ${response.statusText}`);
    }
  }
}
