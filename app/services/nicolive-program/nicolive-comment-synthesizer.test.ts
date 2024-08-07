import { QueueRunner } from 'util/QueueRunner';
import { createSetupFunction } from 'util/test-setup';
import type { ICommentSynthesizerState, Speech } from './nicolive-comment-synthesizer';
import { isWrappedChat, WrappedChat, WrappedMessage } from './WrappedChat';

type NicoliveCommentSynthesizerService =
  import('./nicolive-comment-synthesizer').NicoliveCommentSynthesizerService;

const setup = createSetupFunction({
  injectee: {
    NicoliveProgramStateService: {
      updated: {
        subscribe() {},
      },
      state: {},
      updateSpeechSynthesizerSettings() {},
    },
    NVoiceClientService: {},
    NVoiceCharacterService: {},
  },
});

jest.mock('services/nicolive-program/state', () => ({ NicoliveProgramStateService: {} }));
jest.mock('services/nicolive-program/n-voice-client', () => ({ NVoiceClientService: {} }));
jest.mock('services/nvoice-character', () => ({ NVoiceCharacterService: {} }));

beforeEach(() => {
  jest.doMock('services/core/stateful-service');
  jest.doMock('services/core/injector');
  jest.doMock('util/QueueRunner');
  jest.doMock('./speech/NVoiceSynthesizer');
  jest.doMock('./speech/WebSpeechSynthesizer');
});

afterEach(() => {
  jest.resetModules();
});

const testPitch = 0.2;
const testRate = 0.4;
const testVolume = 0.6;
const testMaxTime = 4;

const mockedState: ICommentSynthesizerState = {
  enabled: true,
  rate: testRate,
  pitch: testPitch,
  maxTime: testMaxTime,
  volume: testVolume,
  selector: {
    normal: 'nVoice',
    operator: 'webSpeech',
    system: 'webSpeech',
  },
};

test('makeSpeechText', async () => {
  setup();
  const { NicoliveCommentSynthesizerService } = require('./nicolive-comment-synthesizer');
  const instance = NicoliveCommentSynthesizerService.instance as NicoliveCommentSynthesizerService;
  expect(
    instance.makeSpeechText({ type: 'normal', value: { content: 'test' }, seqId: 1 }, 'webSpeech'),
  ).toBe('test');

  const gift: WrappedMessage = {
    type: 'gift',
    value: {
      advertiserName: 'advertiserName',
      point: 100,
      itemName: 'itemName',
    },
    seqId: 1,
  } as const;
  expect(instance.makeSpeechText(gift, 'webSpeech')).toBe(
    `${gift.value.advertiserName}さんが「${gift.value.itemName}（${gift.value.point}pt）」を贈りました`,
  );
});

test('makeSpeech', async () => {
  setup();
  const { NicoliveCommentSynthesizerService } = require('./nicolive-comment-synthesizer');
  const instance = NicoliveCommentSynthesizerService.instance as NicoliveCommentSynthesizerService;

  jest.spyOn(instance, 'state', 'get').mockReturnValue(mockedState);

  // 辞書変換しない
  jest
    .spyOn(instance, 'makeSpeechText')
    .mockImplementation(
      (chat: WrappedMessage) => (isWrappedChat(chat) && chat.value.content) || '',
    );

  const makeChat = (s: string): WrappedChat => ({
    type: 'normal',
    value: { content: s },
    seqId: 1,
  });

  const synthId = 'nVoice';
  // 空文字列を与えるとnullが返ってくる
  expect(instance.makeSpeech(makeChat(''))).toBeNull();

  // ignore 設定の時はnullが返ってくる
  expect(instance.makeSpeech(makeChat('test'), 'ignore')).toBeNull();

  // stateの設定値を反映している
  expect(instance.makeSpeech(makeChat('test'))).toEqual({
    text: 'test',
    synthesizer: 'nVoice',
    rate: testRate,
    webSpeech: {
      pitch: testPitch,
    },
    nVoice: {
      maxTime: testMaxTime,
    },
    volume: testVolume,
  });
});

test.each([
  ['normal', false, false, 0, 0, 1],
  ['cancelBeforeSpeaking', true, false, 1, 0, 1],
  ['NUM_COMMENTS_TO_SKIP', false, true, 0, 1, 1],
])(
  'queueToSpeech %s cancelBeforeSpeaking:%s filled:%s cancel:%d add:%d',
  async (
    name: string,
    cancelBeforeSpeaking: boolean,
    filled: boolean,
    numCancel: number,
    numCancelQueue: number,
    numAdd: number,
  ) => {
    setup();
    const { NicoliveCommentSynthesizerService } = require('./nicolive-comment-synthesizer');
    const instance =
      NicoliveCommentSynthesizerService.instance as NicoliveCommentSynthesizerService;
    jest.spyOn(instance, 'state', 'get').mockReturnValue(mockedState);

    (instance.getSynthesizer('nVoice').speakText as jest.Mock).mockImplementation(
      (speech: Speech, onstart: () => void, onend: () => void) => {
        return async () => async () => {
          onstart();
          onend();
          return {
            cancel: async () => {},
            running: Promise.resolve(),
          };
        };
      },
    );

    const queue = instance.queue as jest.Mocked<QueueRunner>;

    const onstart = jest.fn();
    const onend = jest.fn();
    const speech: Speech = {
      text: 'test',
      synthesizer: 'nVoice',
      rate: testRate,
      volume: testVolume,
    };

    Object.defineProperty(queue, 'length', {
      get: () => (filled ? instance.NUM_COMMENTS_TO_SKIP : 0),
    });
    expect(queue.cancel).toBeCalledTimes(0);
    expect(queue.add).toBeCalledTimes(0);
    instance.queueToSpeech(speech, onstart, onend, cancelBeforeSpeaking);
    expect(queue.cancel).toBeCalledTimes(numCancel);
    expect(queue.cancelQueue).toBeCalledTimes(numCancelQueue);
    expect(queue.add).toBeCalledTimes(numAdd);
    if (numAdd) {
      expect(queue.add).toBeCalledWith(expect.anything(), speech.text);
    }
  },
);
