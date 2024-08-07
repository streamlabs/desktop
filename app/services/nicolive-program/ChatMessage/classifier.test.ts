import { NotificationType } from '../ChatMessage';
import { classify } from './classifier';

test('通常コメント', () => {
  expect(classify({ chat: { content: 'comment' } })).toBe('normal');
});

test('プレミアム会員の通常コメント', () => {
  expect(classify({ chat: { premium: 1, content: 'comment' } })).toBe('normal');
});

test('放送者コメント', () => {
  expect(classify({ operator: { content: 'comment' } })).toBe('operator');
});

test('ニコニ広告', () => {
  expect(classify({ nicoad: { v0: {} } })).toBe('nicoad');
  expect(classify({ nicoad: { v1: {} } })).toBe('nicoad');
});

test('ギフト', () => {
  expect(classify({ gift: {} })).toBe('gift');
});

test('エモーション', () => {
  expect(classify({ notification: { type: 'emotion', message: 'args' } })).toBe('emotion');
});

test.each<NotificationType>(['programExtended', 'rankingIn', 'rankingUpdated', 'visited'])(
  'info: %s',
  type => {
    expect(classify({ notification: { type, message: '' } })).toBe('info');
  },
);

test.each<NotificationType>(['ichiba', 'quote', 'cruise'])(`system: %s`, type => {
  expect(classify({ notification: { type, message: '' } })).toBe('system');
});

test('invisible', () => {
  expect(classify({ state: { state: 'ended' } })).toBe('invisible');
  expect(classify({ signal: 'flushed' })).toBe('invisible');
});
