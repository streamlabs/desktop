import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from '../core/stateful-service';
import { Subject, BehaviorSubject, Observable } from 'rxjs';
import { $t } from 'services/i18n';

export const SynthesizerIds = ['webSpeech', 'nVoice'] as const;
export type SynthesizerId = (typeof SynthesizerIds)[number];
export const SynthesizerSelectors = [...SynthesizerIds, 'ignore'] as const;
export type SynthesizerSelector = (typeof SynthesizerSelectors)[number];

type SpeechSynthesizerSettingsState = {
  enabled: boolean;
  pitch: number;
  rate: number;
  volume: number;
  maxTime?: number;
  selector: {
    normal: SynthesizerSelector;
    operator: SynthesizerSelector;
    system: SynthesizerSelector;
  };
};

type NameplateHintState = {
  programID: string;
  commentNo: number;
};

export type HttpRelationState = {
  method: string;
  url: string;
  body: string;
};

interface IState {
  autoExtensionEnabled: boolean;
  panelOpened: boolean;
  speechSynthesizerSettings?: SpeechSynthesizerSettingsState;
  nameplateHint?: NameplateHintState;
  nameplateEnabled: boolean;
  httpRelation: HttpRelationState;
}

/**
 * ニコ生配信機能に関する永続化したい状態を管理するService
 */
export class NicoliveProgramStateService extends PersistentStatefulService<IState> {
  static defaultState: IState = {
    autoExtensionEnabled: false,
    panelOpened: true,
    nameplateEnabled: true,
    httpRelation: { method: '', url: '', body: '' },
  };

  private subject: Subject<IState> = new BehaviorSubject<IState>(this.state);
  updated: Observable<IState> = this.subject.asObservable();

  toggleAutoExtension(): void {
    this.setState({ autoExtensionEnabled: !this.state.autoExtensionEnabled });
  }

  togglePanelOpened(): void {
    this.setState({ panelOpened: !this.state.panelOpened });
  }

  updateSpeechSynthesizerSettings(newState: SpeechSynthesizerSettingsState): void {
    this.setState({ speechSynthesizerSettings: newState });
  }

  updateNameplateHint(newState?: NameplateHintState): void {
    this.setState({ nameplateHint: newState });
  }

  updateNameplateEnabled(newState?: boolean): void {
    this.setState({ nameplateEnabled: newState });
  }

  updateHttpRelation(a: Partial<HttpRelationState>) {
    const ra = { ...this.state.httpRelation, ...a };
    this.setState({ httpRelation: ra });
  }

  private setState(nextState: Partial<IState>): void {
    const newState = { ...this.state, ...nextState };
    this.SET_STATE(newState);
    this.subject.next(newState);
  }

  @mutation()
  private SET_STATE(nextState: IState): void {
    this.state = nextState;
  }
}
