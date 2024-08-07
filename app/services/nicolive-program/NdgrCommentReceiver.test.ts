import { MessageResponse } from './ChatMessage';
import { isChatMessage } from './ChatMessage/util';
import {
  convertChunkedResponseToMessageResponse,
  convertModifierToMail,
} from './NdgrCommentReceiver';
import { dwango } from '@n-air-app/nicolive-comment-protobuf';

// convertModifierToMail の test
describe('convertModifierToMail', () => {
  test.each<{ modifier: dwango.nicolive.chat.data.Chat.IModifier; expected: string }>([
    { modifier: { position: dwango.nicolive.chat.data.Chat.Modifier.Pos.ue }, expected: 'ue' },
    {
      modifier: { position: dwango.nicolive.chat.data.Chat.Modifier.Pos.shita },
      expected: 'shita',
    },
    { modifier: { size: dwango.nicolive.chat.data.Chat.Modifier.Size.big }, expected: 'big' },
    { modifier: { size: dwango.nicolive.chat.data.Chat.Modifier.Size.small }, expected: 'small' },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.red },
      expected: 'red',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.pink },
      expected: 'pink',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.orange },
      expected: 'orange',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.yellow },
      expected: 'yellow',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.green },
      expected: 'green',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.cyan },
      expected: 'cyan',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.blue },
      expected: 'blue',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.purple },
      expected: 'purple',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.black },
      expected: 'black',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.white2 },
      expected: 'white2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.red2 },
      expected: 'red2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.blue2 },
      expected: 'blue2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.green2 },
      expected: 'green2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.yellow2 },
      expected: 'yellow2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.purple2 },
      expected: 'purple2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.cyan2 },
      expected: 'cyan2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.orange2 },
      expected: 'orange2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.pink2 },
      expected: 'pink2',
    },
    {
      modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.black2 },
      expected: 'black2',
    },
    { modifier: { fullColor: { r: 0, g: 0, b: 0 } }, expected: '#000000' },
    { modifier: { fullColor: { r: 255, g: 255, b: 255 } }, expected: '#ffffff' },
    { modifier: { font: dwango.nicolive.chat.data.Chat.Modifier.Font.mincho }, expected: 'mincho' },
    { modifier: { font: dwango.nicolive.chat.data.Chat.Modifier.Font.gothic }, expected: 'gothic' },
    {
      modifier: { opacity: dwango.nicolive.chat.data.Chat.Modifier.Opacity.Translucent },
      expected: '_live',
    },
    {
      modifier: {
        position: dwango.nicolive.chat.data.Chat.Modifier.Pos.shita,
        size: dwango.nicolive.chat.data.Chat.Modifier.Size.big,
        namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.red,
      },
      expected: 'shita big red',
    },
  ])(`convertModifierToMail($expected)`, ({ modifier, expected }) => {
    expect(convertModifierToMail(modifier)).toBe(expected);
  });
});

describe('convertChunkedMessageToMessageResponse', () => {
  const now = 1234567890_123;
  const date = Math.floor(now / 1000);
  const date_usec = (now % 1000) * 1000;
  test('date field', () => {
    const msg: dwango.nicolive.chat.service.edge.IChunkedMessage = {
      meta: {
        at: {
          seconds: Math.floor(now / 1000),
          nanos: (now % 1000) * 1000_000,
        },
      },
      message: { chat: { content: 'test' } },
    };
    const res = convertChunkedResponseToMessageResponse(msg, now + 1 /* now とは異なる時刻 */);
    expect(isChatMessage(res)).toBe(true);
    if (isChatMessage(res)) {
      expect(res.chat.date).toBe(date);
      expect(res.chat.date_usec).toBe(date_usec);
    }
  });

  test.each<{
    title: String;
    msg: dwango.nicolive.chat.service.edge.IChunkedMessage;
    expected: MessageResponse;
  }>([
    {
      title: 'chat',
      msg: { message: { chat: { content: 'test' } } },
      expected: { chat: { date, date_usec, content: 'test' } },
    },
    {
      title: 'chat premium',
      msg: {
        message: {
          chat: {
            content: 'test',
            accountStatus: dwango.nicolive.chat.data.Chat.AccountStatus.Premium,
          },
        },
      },
      expected: { chat: { date, date_usec, content: 'test', premium: 1 } },
    },
    {
      title: 'chat modifier',
      msg: {
        message: {
          chat: {
            content: 'test',
            modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.blue },
          },
        },
      },
      expected: { chat: { date, date_usec, content: 'test', mail: 'blue' } },
    },
    {
      title: 'ichiba',
      msg: { message: { simpleNotification: { ichiba: 'ichiba' } } },
      expected: { notification: { date, date_usec, type: 'ichiba', message: 'ichiba' } },
    },
    {
      title: 'quote',
      msg: { message: { simpleNotification: { quote: 'quote' } } },
      expected: { notification: { date, date_usec, type: 'quote', message: 'quote' } },
    },
    {
      title: 'emotion',
      msg: { message: { simpleNotification: { emotion: 'emotion' } } },
      expected: { notification: { date, date_usec, type: 'emotion', message: 'emotion' } },
    },
    {
      title: 'cruise',
      msg: { message: { simpleNotification: { cruise: 'cruise' } } },
      expected: { notification: { date, date_usec, type: 'cruise', message: 'cruise' } },
    },
    {
      title: 'gift',
      msg: {
        message: {
          gift: {
            itemId: 'itemId',
            advertiserUserId: 1,
            advertiserName: 'advertiserName',
            point: 100,
            message: 'message',
            itemName: 'itemName',
            contributionRank: 1,
          },
        },
      },
      expected: {
        gift: {
          date,
          date_usec,
          itemId: 'itemId',
          advertiserUserId: 1,
          advertiserName: 'advertiserName',
          point: 100,
          message: 'message',
          itemName: 'itemName',
          contributionRank: 1,
        },
      },
    },
    {
      title: 'nicoad v1',
      msg: { message: { nicoad: { v1: { totalAdPoint: 100, message: 'message' } } } },
      expected: { nicoad: { date, date_usec, v1: { totalAdPoint: 100, message: 'message' } } },
    },
    {
      title: 'gameUpdate',
      msg: { message: { gameUpdate: {} } },
      expected: { gameUpdate: { date, date_usec } },
    },
    {
      title: 'show operator comment',
      msg: {
        state: {
          marquee: {
            display: {
              operatorComment: {
                content: 'test',
                name: 'name',
                modifier: { namedColor: dwango.nicolive.chat.data.Chat.Modifier.ColorName.red },
              },
            },
          },
        },
      },
      expected: {
        operator: { date, date_usec, content: 'test', name: 'name', mail: 'red' },
      },
    },
    { title: 'hide operator comment', msg: { state: { marquee: {} } }, expected: undefined },
    {
      title: 'program ended',
      msg: {
        state: { programStatus: { state: dwango.nicolive.chat.data.ProgramStatus.State.Ended } },
      },
      expected: { state: { date, date_usec, state: 'ended' } },
    },
    {
      title: 'signal flush',
      msg: {
        signal: dwango.nicolive.chat.service.edge.ChunkedMessage.Signal.Flushed,
      },
      expected: { signal: 'flushed' },
    },
  ])('$title', ({ msg, expected }) => {
    expect(convertChunkedResponseToMessageResponse(msg, now)).toEqual(expected);
  });
});
