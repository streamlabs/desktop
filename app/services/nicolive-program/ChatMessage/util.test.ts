import { ChatMessage } from '../ChatMessage';
import { isPremium, isAnonymous, getScore } from './util';

const mockBase = {
  content: 'yay',
  date: 1582281644,
  date_usec: 565389,
  no: 1,
  thread: 1663875910,
  user_id: '2SDKBcLAxx6x81a28qJOU7S9wt0',
  vpos: 5640,
};

function makeMockChat(overwrite: ChatMessage = {}) {
  return { ...mockBase, ...overwrite };
}

const standard = makeMockChat({ premium: 0 });
const standardWithoutPremium = makeMockChat({ premium: undefined });
const premium = makeMockChat({ premium: 0b1 });
const yugi = makeMockChat({ premium: 0b10 });
const staff = makeMockChat({ premium: 0b100 });
const yugiAndStaff = makeMockChat({ premium: 0b110 });
const nonOperatorChat = makeMockChat({ content: '/vote stop', premium: 0b1 });
const operatorCommand = makeMockChat({ content: '/vote stop', premium: 0b10 });
const operatorComment = makeMockChat({ content: '175622', premium: 0b11 });
const anonymous = makeMockChat({ anonymity: 1 });
const scored = makeMockChat({ score: -500 });
const jsonContent = makeMockChat({ content: '/type {"value":true}' });
const textContent = makeMockChat({ content: '/type some message values' });

test('isPremium', () => {
  expect(isPremium(premium)).toBe(true);
  expect(isPremium(standard)).toBe(false);
  expect(isPremium(standardWithoutPremium)).toBe(false);
});

test('isAnonymous', () => {
  expect(isAnonymous(anonymous)).toBe(true);

  expect(isAnonymous(nonOperatorChat)).toBe(false);
});

test('getScore', () => {
  expect(getScore(scored)).toBe(-500);
  expect(getScore(anonymous)).toBe(0);
  expect(getScore(nonOperatorChat)).toBe(0);
});
