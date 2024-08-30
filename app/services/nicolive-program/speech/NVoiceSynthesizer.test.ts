import { sleep } from 'util/sleep';
import { Speech } from '../nicolive-comment-synthesizer';
import { NVoiceSynthesizer } from './NVoiceSynthesizer';

describe('NVoiceSynthesizer', () => {
  test('speakText', async () => {
    const cancelMock = jest.fn(async () => {});
    let resolvePrepare: () => void;
    const preparePromise = new Promise<void>(resolve => {
      resolvePrepare = resolve;
    });
    let resolveSpeaking: () => void;
    const speakingPromise = new Promise<void>(resolve => {
      resolveSpeaking = resolve;
    });
    const talkMock = jest.fn(async (text, options) => {
      await preparePromise;
      if (text) {
        return async () => ({
          cancel: cancelMock,
          speaking: speakingPromise,
        });
      } else {
        return null;
      }
    });
    const synth = new NVoiceSynthesizer({ talk: talkMock });
    const onstart = jest.fn();
    const onend = jest.fn();
    const onPhoneme = jest.fn();
    const speech: Speech = {
      synthesizer: 'nVoice',
      text: 'test',
      nVoice: {
        maxTime: 4,
      },
      rate: 0.5,
      volume: 0.5,
    };

    const prepare = synth.speakText(speech, onstart, onend, onPhoneme);
    const running = prepare().then(start => (start ? start() : null));

    expect(talkMock).toBeCalledTimes(1);
    if (talkMock.mock.calls[0].length > 0) {
      const textArg = talkMock.mock.calls[0][0];
      expect(textArg).toEqual(speech.text);
      const optionsArg = talkMock.mock.calls[0][1];
      expect(optionsArg.speed).toEqual(1 / speech.rate);
      expect(optionsArg.volume).toEqual(speech.volume);
      expect(optionsArg.maxTime).toEqual(speech.nVoice.maxTime);
    }

    resolvePrepare();
    const result = await running;
    expect(result).not.toBeNull();
    expect(cancelMock).toBeCalledTimes(0);
    expect(onstart).toBeCalledTimes(1);
    expect(onend).toBeCalledTimes(0);

    resolveSpeaking();
    await sleep(0);
    expect(onend).toBeCalledTimes(1);
    await result.running;
  });

  test.todo('cancel');
});
