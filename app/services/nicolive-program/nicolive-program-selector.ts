import { StatefulService, mutation } from 'services/core/stateful-service';
import { FailedResult, NicoliveClient, isOk } from './NicoliveClient';
import { NicoliveFailure, openErrorDialogFromFailure } from './NicoliveFailure';
import { OnairChannelData } from './ResponseTypes';

/**
 * 配信する番組種別
 * 配列の並び順は表示順序.
 */
export const providerTypes = ['channel', 'user'] as const;
export type TProviderType = (typeof providerTypes)[number];

/**
 * 選択肢からなるステップ.
 * 配列の並び順はステップの順序.
 */
export const selectionSteps = ['providerTypeSelect', 'channelSelect', 'programSelect'] as const;
export type TSelectionStep = (typeof selectionSteps)[number];

/**
 * 最後の「確認」を含めた全ステップ.
 * 配列の並び順はステップの順序.
 */
export const steps = [...selectionSteps, 'confirm'] as const;
export type TStep = (typeof steps)[number];

/**
 * ステップ名をキーに, その順番(0, 1...)を値にしたオブジェクト.
 * ステップ同士の順序の判定に使用する.
 * ```
 * {
 *   'providerTypeSelect': 0
 *   'channelSelect': 1,
 *   // ...
 * }
 * ```
 */
const stepsMap = steps.reduce<{ [key in TStep]?: number }>(
  (prev, current, index) => ({ ...prev, [current]: index }),
  {},
) as { [key in TStep]: number };

export interface INicoliveProgramSelectorState {
  selectedProviderType: TProviderType | null;
  selectedChannel: { id: string; name: string } | null;
  selectedChannelProgram: { id: string; title: string } | null; // ユーザー生放送時 null
  candidateChannels: OnairChannelData[];
  candidatePrograms: { id: string; title: string }[];
  isLoading: boolean;
  currentStep: TStep;
}

export class NicoliveProgramSelectorService extends StatefulService<INicoliveProgramSelectorState> {
  static initialState: INicoliveProgramSelectorState = {
    selectedProviderType: null,
    selectedChannel: null,
    selectedChannelProgram: null,
    candidateChannels: [],
    candidatePrograms: [],
    isLoading: false,
    currentStep: 'providerTypeSelect',
  };

  client = new NicoliveClient();

  init() {
    super.init();
  }

  async onSelectProviderType(providerType: TProviderType) {
    if (this.state.currentStep !== 'providerTypeSelect') {
      return;
    }
    if (providerType === 'channel') {
      this.SET_STATE({
        currentStep: 'channelSelect',
        selectedProviderType: 'channel',
        isLoading: true,
      });
      try {
        const methodName = 'fetchOnairChannels';
        const onairChannelsResult = await this.client.fetchOnairChannels();
        if (!isOk(onairChannelsResult)) {
          throw NicoliveFailure.fromClientError(methodName, onairChannelsResult);
        }
        if (onairChannelsResult.value.length < 1) {
          throw NicoliveFailure.fromConditionalError(methodName, 'no_channels');
        }
        this.SET_STATE({
          isLoading: false,
          candidateChannels: onairChannelsResult.value,
        });
      } catch (error) {
        await openErrorDialogFromFailure(error as NicoliveFailure);
        this.SET_STATE({ isLoading: false });
      }
    } else {
      // providerType === 'user'
      this.SET_STATE({
        selectedProviderType: 'user',
        selectedChannel: null,
        currentStep: 'confirm',
      });
    }
  }

  private async fetchOnairChannelPrograms(channelId: string) {
    try {
      const onairChannelProgramResult = await this.client.fetchOnairChannelProgram(channelId);
      if (isOk(onairChannelProgramResult)) {
        const { testProgramId, programId, nextProgramId } = onairChannelProgramResult.value;
        return [testProgramId, programId, nextProgramId];
      } else {
        throw onairChannelProgramResult;
      }
    } catch (error) {
      throw NicoliveFailure.fromClientError('fetchOnairChannelProgram', error as FailedResult);
    }
  }

  /**
   * 配信先チャンネルを選択したときの処理.
   * 番組選択ステップへ移動後, APIを叩いて番組IDからタイトルを解決し, candidatePrograms に番組IDとタイトルを保存する.
   * @param id 配信するチャンネルID (chXXXX)
   * @param name 配信するチャンネル名
   */
  async onSelectChannel(id: string, name: string) {
    if (this.state.currentStep !== 'channelSelect') {
      return;
    }
    this.SET_STATE({
      selectedChannel: { id, name },
      currentStep: 'programSelect',
      candidatePrograms: [],
      isLoading: true,
    });
    try {
      const programs = await this.fetchOnairChannelPrograms(id);
      const candidateProgramIds = programs.filter(Boolean);
      const candidatePrograms = (
        await Promise.all(
          candidateProgramIds.map(async programId => {
            const programResult = await this.client.fetchProgram(programId);
            if (isOk(programResult)) {
              return { id: programId, title: programResult.value.title };
            } else if (
              programResult.value instanceof Error ||
              programResult.value.meta.status !== 404
            ) {
              // ネットワークエラー, メンテナンスの場合など
              throw NicoliveFailure.fromClientError('fetchProgram', programResult);
            }
            // 与えられた lv の番組が見つからない場合 (HTTP 404 時) はその番組は出さない
            return undefined;
          }),
        )
      ).filter(Boolean);
      this.SET_STATE({
        candidatePrograms,
        isLoading: false,
      });
    } catch (error) {
      await openErrorDialogFromFailure(error as NicoliveFailure);
      this.SET_STATE({ isLoading: false });
    }
  }

  onSelectBroadcastingProgram(id: string, title: string) {
    if (this.state.currentStep !== 'programSelect') {
      return;
    }
    this.SET_STATE({
      selectedChannelProgram: { id, title },
      currentStep: 'confirm',
    });
  }

  /**
   * 与えられたステップが現在のステップもしくはすでに完了したステップであるか.
   * @param step
   */
  isCompletedOrCurrentStep(step: TStep): boolean {
    if (this.isStepToSkip(step, this.state.selectedProviderType)) {
      return false;
    }
    return stepsMap[this.state.currentStep] >= stepsMap[step];
  }

  /**
   * 与えられたステップがすでに完了したステップであるか.
   * @param step
   */
  isCompletedStep(step: TStep): boolean {
    if (this.isStepToSkip(step, this.state.selectedProviderType)) {
      return false;
    }
    return stepsMap[this.state.currentStep] > stepsMap[step];
  }

  /**
   * 状態を初期状態にリセットする.
   */
  reset() {
    this.backTo('providerTypeSelect');
    this.SET_STATE({ isLoading: false });
  }

  /**
   * 指定ステップに戻る.
   * 指定ステップ以降で設定された値は初期値にリセットする.
   * 完了していないステップが与えられた場合は何もしない.
   * @param step
   */
  backTo(step: TStep) {
    if (!this.isCompletedStep(step)) {
      return;
    }
    this.SET_STATE({
      currentStep: step,
      candidateChannels:
        stepsMap[step] <= stepsMap['providerTypeSelect'] ? [] : this.state.candidateChannels,
      candidatePrograms:
        stepsMap[step] <= stepsMap['channelSelect'] ? [] : this.state.candidatePrograms,
      selectedProviderType:
        stepsMap[step] <= stepsMap['providerTypeSelect'] ? null : this.state.selectedProviderType,
      selectedChannel:
        stepsMap[step] <= stepsMap['channelSelect'] ? null : this.state.selectedChannel,
      selectedChannelProgram:
        stepsMap[step] <= stepsMap['programSelect'] ? null : this.state.selectedChannelProgram,
    });
  }

  /**
   * ユーザー生放送が選択されている場合,
   * 与えられたステップがスキップされるべきものなら true を, さもなくば false を返す.
   * チャンネル生放送が選択されている場合, 常に false を返す.
   * @param step
   * @param providerType
   */
  private isStepToSkip(step: TStep, providerType: TProviderType): boolean {
    return providerType === 'user' && (step === 'programSelect' || step === 'channelSelect');
  }

  @mutation()
  private SET_STATE(nextState: Partial<INicoliveProgramSelectorState>) {
    this.state = { ...this.state, ...nextState };
  }
}
