import { InitAfter, Inject } from 'services/core';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { NVoiceCharacterService } from 'services/nvoice-character';
import { QueueRunner } from 'util/QueueRunner';
import { AddComponent } from './ChatMessage/ChatComponentType';
import { getDisplayText } from './ChatMessage/displaytext';
import { NVoiceClientService } from './n-voice-client';
import { ParaphraseDictionary } from './ParaphraseDictionary';
import { PhonemeServer } from './PhonemeServer';
import { ISpeechSynthesizer } from './speech/ISpeechSynthesizer';
import { NVoiceSynthesizer } from './speech/NVoiceSynthesizer';
import { VoicevoxSynthesizer } from './speech/VoicevoxSynthesizer';
import { WebSpeechSynthesizer } from './speech/WebSpeechSynthesizer';
import { NicoliveProgramStateService, SynthesizerId, SynthesizerSelector } from './state';
import { WrappedMessage } from './WrappedChat';

export interface VoicevoxParam {
  id: string;
  //speed?: number;
}

export type Speech = {
  text: string;
  synthesizer: SynthesizerId;
  rate: number; // 速度
  webSpeech?: {
    pitch?: number; // 声の高さ
  };
  volume?: number;
  nVoice?: {
    maxTime: number;
  };
  voicevox?: VoicevoxParam;
};

export interface ICommentSynthesizerState {
  enabled: boolean;
  pitch: number; // SpeechSynthesisUtterance.pitch; 0.1(lowest) to 2(highest) (default: 1), only for web speech
  rate: number; // SpeechSynthesisUtterence.rate; 0.1(lowest) to 10(highest); default:1
  volume: number; // SpeechSynthesisUtterance.volume; 0.1(lowest) to 1(highest)
  maxTime: number; // nVoice max time in seconds
  selector: {
    normal: SynthesizerSelector;
    operator: SynthesizerSelector;
    system: SynthesizerSelector;
  };
  voicevox: { normal: VoicevoxParam; operator: VoicevoxParam; system: VoicevoxParam };
}

@InitAfter('NicoliveProgramStateService')
export class NicoliveCommentSynthesizerService extends StatefulService<ICommentSynthesizerState> {
  @Inject('NicoliveProgramStateService') stateService: NicoliveProgramStateService;
  @Inject() nVoiceClientService: NVoiceClientService;
  @Inject() nVoiceCharacterService: NVoiceCharacterService;

  static initialState: ICommentSynthesizerState = {
    enabled: true,
    pitch: 1,
    rate: 1,
    volume: 1,
    maxTime: 4,
    selector: {
      normal: 'nVoice',
      operator: 'nVoice',
      system: 'webSpeech',
    },
    voicevox: { normal: { id: '' }, operator: { id: '' }, system: { id: '' } },
  };

  // この数すでにキューに溜まっている場合は破棄してから追加する
  NUM_COMMENTS_TO_SKIP = 5;

  // delegate synth
  webSpeech = new WebSpeechSynthesizer();
  nVoice: NVoiceSynthesizer;
  voicevox = new VoicevoxSynthesizer();

  getSynthesizer(id: SynthesizerId): ISpeechSynthesizer | null {
    switch (id) {
      case 'webSpeech':
        return this.webSpeech;
      case 'nVoice':
        return this.nVoice;
      case 'voicevox':
        return this.voicevox;
      default:
        return null;
    }
  }

  queue = new QueueRunner();

  phonemeServer: PhonemeServer;

  init(): void {
    this.setState({
      ...NicoliveCommentSynthesizerService.initialState,
      ...(this.stateService.state.speechSynthesizerSettings
        ? this.stateService.state.speechSynthesizerSettings
        : {}),
    });

    this.stateService.updated.subscribe({
      next: persistentState => {
        const newState =
          {
            ...NicoliveCommentSynthesizerService.initialState,
            ...persistentState.speechSynthesizerSettings,
          } || NicoliveCommentSynthesizerService.initialState;
        this.SET_STATE(newState);
      },
    });
    this.nVoice = new NVoiceSynthesizer(this.nVoiceClientService);

    this.phonemeServer = new PhonemeServer({
      onPortAssigned: port => {
        this.nVoiceCharacterService.updateSocketIoPort(port);
      },
    });
  }

  private dictionary = new ParaphraseDictionary();

  makeSpeechText(chat: WrappedMessage, engine: SynthesizerId): string {
    if (!chat.value) {
      return '';
    }
    const text = getDisplayText(AddComponent(chat));
    if (!text) {
      return '';
    }

    const converted = this.dictionary.process(text, engine);

    return converted;
  }

  private selectSpeechSynthesizer(chat: WrappedMessage): SynthesizerSelector {
    switch (chat.type) {
      case 'normal':
        return this.state.selector.normal;
      case 'operator':
        return this.state.selector.operator;
      default:
        return this.state.selector.system;
    }
  }

  makeSpeech(chat: WrappedMessage, synthId?: SynthesizerSelector): Speech | null {
    const synthesizer = synthId || this.selectSpeechSynthesizer(chat);
    if (synthesizer === 'ignore') {
      return null;
    }

    const r = this.makeSpeechText(chat, synthesizer);
    if (r === '') {
      return null;
    }
    const speech: Speech = {
      rate: this.state.rate,
      synthesizer,
      volume: this.state.volume,
      webSpeech: {
        pitch: this.state.pitch,
      },
      nVoice: {
        maxTime: this.state.maxTime,
      },
      text: r,
    };

    if (synthesizer === 'voicevox') {
      if (chat.type === 'normal') speech.voicevox = this.state.voicevox.normal;
      else if (chat.type === 'operator') speech.voicevox = this.state.voicevox.operator;
      else if (chat.type === 'system') speech.voicevox = this.state.voicevox.system;
    }

    return speech;
  }

  makeSimpleTextSpeech(text: string, synthId?: SynthesizerId, type?: string): Speech | null {
    return this.makeSpeech(
      {
        type: (type ?? 'normal') as any,
        value: {
          content: text,
        },
        seqId: 1,
      },
      synthId,
    );
  }

  startSpeakingSimple(speech: Speech) {
    // empty anonymous functions must be created in this service
    this.queueToSpeech(
      speech,
      () => {},
      () => {},
      true,
    );
  }

  startTestSpeech(text: string, synthId: SynthesizerId, type?: string) {
    const speech = this.makeSimpleTextSpeech(text, synthId, type);
    if (!speech) return;
    this.startSpeakingSimple(speech);
  }

  queueToSpeech(
    speech: Speech,
    onstart: () => void,
    onend: () => void,
    cancelBeforeSpeaking = false,
  ) {
    if (!this.enabled) {
      return;
    }

    const toPlay = speech.synthesizer;
    const toPlaySynth = this.getSynthesizer(toPlay);
    if (toPlaySynth === null) return;

    if (cancelBeforeSpeaking) {
      this.queue.cancel();
    } else if (this.queue.length >= this.NUM_COMMENTS_TO_SKIP) {
      // コメント溜まりすぎスキップ
      // TODO 飛ばした発言
      this.queue.cancelQueue();
    }

    this.queue.add(
      toPlaySynth.speakText(
        speech,
        () => {
          onstart();
        },
        () => {
          onend();
        },
        phoneme => {
          this.phonemeServer?.emitPhoneme(phoneme);
        },
      ),
      speech.text,
    );
    this.queue.runNext();
  }

  private setEnabled(enabled: boolean) {
    this.setState({ enabled });
    if (!enabled) {
      this.queue.cancel();
    }
  }
  get enabled(): boolean {
    return this.state.enabled;
  }
  set enabled(e: boolean) {
    this.setEnabled(e);
  }

  private setPitch(pitch: number) {
    this.setState({ pitch });
  }
  get pitch(): number {
    return this.state.pitch;
  }
  set pitch(p: number) {
    this.setPitch(p);
  }

  private setRate(rate: number) {
    this.setState({ rate });
  }
  get rate(): number {
    return this.state.rate;
  }
  set rate(r: number) {
    this.setRate(r);
  }

  private setVolume(volume: number) {
    this.setState({ volume });
  }
  get volume(): number {
    return this.state.volume;
  }
  set volume(r: number) {
    this.setVolume(r);
  }

  private setMaxTime(maxTime: number) {
    this.setState({ maxTime });
  }
  get maxTime(): number {
    return this.state.maxTime || NicoliveCommentSynthesizerService.initialState.maxTime;
  }
  set maxTime(m: number) {
    this.setMaxTime(m);
  }

  // selector accessor
  get normal(): SynthesizerSelector {
    return this.state.selector.normal;
  }
  set normal(s: SynthesizerSelector) {
    this.setState({ selector: { ...this.state.selector, normal: s } });
  }
  get operator(): SynthesizerSelector {
    return this.state.selector.operator;
  }
  set operator(s: SynthesizerSelector) {
    this.setState({ selector: { ...this.state.selector, operator: s } });
  }
  get system(): SynthesizerSelector {
    return this.state.selector.system;
  }
  set system(s: SynthesizerSelector) {
    this.setState({ selector: { ...this.state.selector, system: s } });
  }

  get voicevoxNormal(): VoicevoxParam {
    return this.state.voicevox.normal;
  }
  set voicevoxNormal(param: Partial<VoicevoxParam>) {
    const normal = { ...this.state.voicevox.normal, ...param };
    this.setState({ voicevox: { ...this.state.voicevox, normal } });
  }
  get voicevoxOperator(): VoicevoxParam {
    return this.state.voicevox.operator;
  }
  set voicevoxOperator(param: Partial<VoicevoxParam>) {
    const operator = { ...this.state.voicevox.operator, ...param };
    this.setState({ voicevox: { ...this.state.voicevox, operator } });
  }
  get voicevoxSystem(): VoicevoxParam {
    return this.state.voicevox.system;
  }
  set voicevoxSystem(param: Partial<VoicevoxParam>) {
    const system = { ...this.state.voicevox.system, ...param };
    this.setState({ voicevox: { ...this.state.voicevox, system } });
  }

  private setState(partialState: Partial<ICommentSynthesizerState>) {
    const nextState = { ...this.state, ...partialState };
    this.stateService.updateSpeechSynthesizerSettings(nextState);
  }

  @mutation()
  private SET_STATE(nextState: ICommentSynthesizerState): void {
    this.state = nextState;
  }
}
