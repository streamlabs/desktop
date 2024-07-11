import * as Sentry from '@sentry/vue';
import { BehaviorSubject } from 'rxjs';
import { Inject } from 'services/core/injector';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { UserService } from 'services/user';
import { CreateResult, EditResult, isOk, NicoliveClient } from './NicoliveClient';
import { NicoliveFailure, openErrorDialogFromFailure } from './NicoliveFailure';
import { Community, ProgramSchedules } from './ResponseTypes';
import { NicoliveProgramStateService } from './state';
import { MAX_PROGRAM_DURATION_SECONDS } from './nicolive-constants';
import { isFakeMode } from 'util/fakeMode';

type Schedules = ProgramSchedules['data'];
type Schedule = Schedules[0];

type ProgramState = {
  programID: string;
  status: 'reserved' | 'test' | 'onAir' | 'end';
  title: string;
  description: string;
  endTime: number;
  startTime: number;
  vposBaseTime: number;
  isMemberOnly: boolean;
  communityID: string;
  communityName: string;
  communitySymbol: string;
  roomURL: string;
  roomThreadID: string;
  viewers: number;
  comments: number;
  adPoint: number;
  giftPoint: number;
  showPlaceholder: boolean;
  moderatorViewUri?: string;
};

function getCommunityIconUrl(community: Community): string {
  const urls = community.icon.url;
  if (urls.size_64x64) {
    return urls.size_64x64;
  }
  // 目的のサイズが存在しなかった場合、フォールバックとして存在する一つを返す
  return urls[Object.keys(urls)[0]] || '';
}

interface INicoliveProgramState extends ProgramState {
  /**
   * 永続化された状態をコンポーネントに伝えるための一時置き場
   * 直接ここを編集してはいけない、stateService等の操作結果を反映するだけにする
   */
  autoExtensionEnabled: boolean;
  panelOpened: boolean | null; // 初期化前はnull、永続化された値の読み出し後に値が入る
  isLoggedIn: boolean | null; // 初期化前はnull、永続化された値の読み出し後に値が入る

  isFetching: boolean;
  isExtending: boolean;
  isStarting: boolean;
  isEnding: boolean;
}

export enum PanelState {
  INACTIVE = 'INACTIVE',
  OPENED = 'OPENED',
  CLOSED = 'CLOSED',
  COMPACT = 'COMPACT',
}

export class NicoliveProgramService extends StatefulService<INicoliveProgramState> {
  @Inject('NicoliveProgramStateService') stateService: NicoliveProgramStateService;
  @Inject()
  userService: UserService;

  private stateChangeSubject = new BehaviorSubject(this.state);
  stateChange = this.stateChangeSubject.asObservable();

  client: NicoliveClient = new NicoliveClient();

  static programInitialState: ProgramState = {
    programID: '',
    status: 'end',
    title: '',
    description: '',
    endTime: NaN,
    startTime: NaN,
    vposBaseTime: NaN,
    isMemberOnly: false,
    communityID: '',
    communityName: '',
    communitySymbol: '',
    roomURL: '',
    roomThreadID: '',
    viewers: 0,
    comments: 0,
    adPoint: 0,
    giftPoint: 0,
    showPlaceholder: false,
  };

  static initialState: INicoliveProgramState = {
    ...NicoliveProgramService.programInitialState,
    autoExtensionEnabled: false,
    panelOpened: null,
    isLoggedIn: null,
    isFetching: false,
    isExtending: false,
    isStarting: false,
    isEnding: false,
  };

  init(): void {
    super.init();

    this.stateService.updated.subscribe({
      next: persistentState => {
        this.setState(persistentState);
      },
    });

    this.userService.userLoginState.subscribe({
      next: user => {
        this.setState({ isLoggedIn: Boolean(user) });
        if (!user) {
          this.setState(NicoliveProgramService.programInitialState);
        }
      },
    });

    // UserServiceのSubjectをBehaviorに変更するのは影響が広すぎる
    this.setState({
      isLoggedIn: this.userService.isLoggedIn(),
    });
  }

  private setState(partialState: Partial<INicoliveProgramState>) {
    const nextState = {
      ...this.state,
      ...partialState,
      ...(partialState.status !== undefined && partialState.status !== 'test'
        ? { showPlaceholder: false }
        : {}),
    };
    this.refreshStatisticsPolling(this.state, nextState);
    this.refreshProgramStatusTimer(this.state, nextState);
    this.refreshAutoExtensionTimer(this.state, nextState);
    this.SET_STATE(nextState);
    this.stateChangeSubject.next(nextState);
  }

  @mutation()
  private SET_STATE(nextState: INicoliveProgramState): void {
    this.state = nextState;
  }

  /**
   * 番組スケジュールから表示すべき番組を選ぶ
   * 1. テスト中または放送中の番組があればその番組を返す
   * 2. 予約番組があるなら最も近い予約番組を返す
   */
  static findSuitableProgram(schedules: Schedules): null | Schedule {
    // テスト中・放送中の番組があればそれで確定
    const currentProgram = schedules.find(
      s => s.socialGroupId.startsWith('co') && (s.status === 'test' || s.status === 'onAir'),
    );
    if (currentProgram) return currentProgram;

    let nearestReservedProgram: null | Schedule = null;
    for (const s of schedules) {
      // ユーザー生放送以外は無視
      if (!s.socialGroupId.startsWith('co')) continue;
      if (s.status === 'end') continue;

      // 一番近い予約放送を選ぶ
      if (!nearestReservedProgram || s.onAirBeginAt < nearestReservedProgram.onAirBeginAt) {
        nearestReservedProgram = s;
      }
    }
    return nearestReservedProgram;
  }

  static isProgramExtendable(state: INicoliveProgramState): boolean {
    return (
      state.status === 'onAir' && state.endTime - state.startTime < MAX_PROGRAM_DURATION_SECONDS
    );
  }

  static format(timeInSeconds: number): string {
    if (Number.isNaN(timeInSeconds)) return '--:--:--';
    const absTime = Math.abs(timeInSeconds);
    const s = absTime % 60;
    const m = Math.floor(absTime / 60) % 60;
    const h = Math.floor(absTime / 3600);
    const sign = Math.sign(timeInSeconds) > 0 ? '' : '-';
    const ss = s.toString(10).padStart(2, '0');
    const mm = m.toString(10).padStart(2, '0');
    const hh = h.toString(10).padStart(2, '0');
    return `${sign}${hh}:${mm}:${ss}`;
  }

  get hasProgram(): boolean {
    return Boolean(this.state.programID);
  }

  get isProgramExtendable(): boolean {
    return NicoliveProgramService.isProgramExtendable(this.state);
  }

  get isShownPlaceholder(): boolean {
    return this.state.showPlaceholder;
  }

  showPlaceholder() {
    this.setState({
      showPlaceholder: true,
    });
  }

  hidePlaceholder() {
    if (this.state.showPlaceholder) {
      this.setState({
        showPlaceholder: false,
      });
    }
  }

  async createProgram(): Promise<CreateResult> {
    if (isFakeMode()) {
      await this.fetchProgram();
      return CreateResult.CREATED;
    }
    const result = await this.client.createProgram();
    if (result === 'CREATED') {
      await this.fetchProgram();
    }
    return result;
  }

  async fetchProgram(): Promise<void> {
    this.setState({ isFetching: true });
    if (isFakeMode()) {
      const now = Math.floor(Date.now() / 1000);
      this.setState({
        programID: 'lvDEBUG',
        status: 'onAir',
        title: 'DEBUG番組',
        description: 'N Airデザイン作業用番組',
        startTime: now,
        vposBaseTime: now,
        endTime: now + 60 * 60,
        isMemberOnly: true,
        communityID: 'coDEBUG',
        communityName: 'DEBUGコミュニティ',
        communitySymbol: '',
        roomURL: 'URL',
        roomThreadID: 'thread',
      });
      return;
    }
    try {
      const schedulesResponse = await this.client.fetchProgramSchedules();
      if (!isOk(schedulesResponse)) {
        throw NicoliveFailure.fromClientError('fetchProgramSchedules', schedulesResponse);
      }

      const programSchedule = NicoliveProgramService.findSuitableProgram(schedulesResponse.value);

      if (!programSchedule) {
        this.setState({ status: 'end' });
        Sentry.addBreadcrumb({
          category: 'program',
          message: 'suitable program not found',
          data: { schedulesResponse: schedulesResponse.value },
        });
        throw NicoliveFailure.fromConditionalError('fetchProgram', 'no_suitable_program');
      }
      const { nicoliveProgramId, socialGroupId } = programSchedule;

      const [programResponse, communityResponse] = await Promise.all([
        this.client.fetchProgram(nicoliveProgramId),
        this.client.fetchCommunity(socialGroupId),
      ]);
      if (!isOk(programResponse)) {
        throw NicoliveFailure.fromClientError('fetchProgram', programResponse);
      }
      if (!isOk(communityResponse)) {
        // コミュニティ情報が取れなくても配信はできてよいはず
        if (communityResponse.value instanceof Error) {
          console.error('fetchCommunity', communityResponse.value);
        } else {
          console.error(
            'fetchCommunity',
            communityResponse.value.meta.status,
            communityResponse.value.meta.errorMessage || '',
          );
        }
      }

      const community = isOk(communityResponse) && communityResponse.value;
      const program = programResponse.value;

      // アリーナのみ取得する
      const room = program.rooms.find(r => r.id === 0);

      this.setState({
        programID: nicoliveProgramId,
        status: program.status,
        title: program.title,
        description: program.description,
        startTime: program.beginAt,
        vposBaseTime: program.vposBaseAt,
        endTime: program.endAt,
        isMemberOnly: program.isMemberOnly,
        communityID: socialGroupId,
        communityName: community ? community.name : '(コミュニティの取得に失敗しました)',
        communitySymbol: community ? getCommunityIconUrl(community) : '',
        roomURL: room ? room.webSocketUri : '',
        roomThreadID: room ? room.threadId : '',
        ...(program.moderatorViewUri ? { moderatorViewUri: program.moderatorViewUri } : {}),
      });
      if (program.status === 'test') {
        this.showPlaceholder();
      }
    } finally {
      this.setState({ isFetching: false });
    }
  }

  async refreshProgram(): Promise<void> {
    if (isFakeMode()) {
      await this.fetchProgram();
      return;
    }
    const programResponse = await this.client.fetchProgram(this.state.programID);
    if (!isOk(programResponse)) {
      throw NicoliveFailure.fromClientError('fetchProgram', programResponse);
    }

    const program = programResponse.value;
    const room = program.rooms.find(r => r.id === 0);

    this.setState({
      status: program.status,
      title: program.title,
      description: program.description,
      startTime: program.beginAt,
      endTime: program.endAt,
      isMemberOnly: program.isMemberOnly,
      roomURL: room ? room.webSocketUri : '',
      roomThreadID: room ? room.threadId : '',
    });
  }

  async editProgram(): Promise<EditResult> {
    if (isFakeMode()) {
      return;
    }
    const result = await this.client.editProgram(this.state.programID);
    if (result === 'EDITED') {
      await this.refreshProgram();
    }
    return result;
  }

  async startProgram(): Promise<void> {
    this.setState({ isStarting: true });
    try {
      const result = await this.client.startProgram(this.state.programID);
      if (!isOk(result)) {
        throw NicoliveFailure.fromClientError('startProgram', result);
      }

      const endTime = result.value.end_time;
      const startTime = result.value.start_time;
      this.setState({ status: 'onAir', endTime, startTime });
    } finally {
      this.setState({ isStarting: false });
    }
  }

  async endProgram(): Promise<void> {
    if (isFakeMode()) {
      this.setState({ status: 'end' });
      return;
    }
    this.setState({ isEnding: true });
    try {
      const result = await this.client.endProgram(this.state.programID);
      if (!isOk(result)) {
        throw NicoliveFailure.fromClientError('endProgram', result);
      }

      const endTime = result.value.end_time;
      this.setState({ status: 'end', endTime });
    } finally {
      this.setState({ isEnding: false });
    }
  }

  toggleAutoExtension(): void {
    this.stateService.toggleAutoExtension();
  }

  async extendProgram(): Promise<void> {
    this.setState({ isExtending: true });
    try {
      if (isFakeMode()) {
        const endTime = this.state.endTime + 30 * 60;
        this.setState({ endTime });
        return;
      }

      return await this.internalExtendProgram(this.state);
    } finally {
      this.setState({ isExtending: false });
    }
  }

  private async internalExtendProgram(state: INicoliveProgramState): Promise<void> {
    const result = await this.client.extendProgram(state.programID);
    if (!isOk(result)) {
      throw NicoliveFailure.fromClientError('extendProgram', result);
    }

    const endTime = result.value.end_time;
    this.setState({ endTime });
  }

  private statsTimer: number = 0;
  refreshStatisticsPolling(
    prevState: INicoliveProgramState,
    nextState: INicoliveProgramState,
  ): void {
    const programUpdated = prevState.programID !== nextState.programID;

    const prev = prevState.status === 'onAir';
    const next = nextState.status === 'onAir';

    if ((!prev && next) || (next && programUpdated)) {
      clearInterval(this.statsTimer);
      this.updateStatistics(nextState.programID); // run and forget
      this.statsTimer = window.setInterval(
        (id: string) => this.updateStatistics(id),
        60 * 1000,
        nextState.programID,
      );
    } else if (prev && !next) {
      clearInterval(this.statsTimer);
    }
  }

  updateStatistics(programID: string): Promise<any> {
    if (isFakeMode()) {
      return Promise.resolve();
    }
    const stats = this.client
      .fetchStatistics(programID)
      .then(res => {
        if (isOk(res)) {
          this.setState({
            viewers: res.value.watchCount,
            comments: res.value.commentCount,
          });
        }
      })
      .catch(() => null);
    const adStats = this.client
      .fetchNicoadStatistics(programID)
      .then(res => {
        if (isOk(res)) {
          this.setState({
            adPoint: res.value.totalAdPoint,
            giftPoint: res.value.totalGiftPoint,
          });
        }
      })
      .catch(() => null);

    // return for testing
    return Promise.all([stats, adStats]);
  }

  async sendOperatorComment(text: string, isPermanent: boolean): Promise<void> {
    if (isFakeMode()) {
      // TODO
      return;
    }
    const result = await this.client.sendOperatorComment(this.state.programID, {
      text,
      isPermanent,
    });
    if (!isOk(result)) {
      throw NicoliveFailure.fromClientError('sendOperatorComment', result);
    }
  }

  static TIMER_PADDING_SECONDS = 3;
  static REFRESH_TARGET_TIME_TABLE = {
    reserved: 'startTime',
    test: 'startTime',
    onAir: 'endTime',
  };
  private refreshProgramTimer = 0;
  refreshProgramStatusTimer(
    prevState: INicoliveProgramState,
    nextState: INicoliveProgramState,
  ): void {
    const programUpdated = prevState.programID !== nextState.programID;
    const statusUpdated = prevState.status !== nextState.status;

    /** 放送状態が変化しなかった前提で、放送状態が次に変化するであろう時刻 */
    const prevTargetTime: number =
      prevState[NicoliveProgramService.REFRESH_TARGET_TIME_TABLE[nextState.status]];
    /*: 予約番組で現在時刻が開始時刻より30分以上前なら、30分を切ったときに再取得するための補正項 */
    const readyTimeTermIfReserved =
      nextState.status === 'reserved' &&
      nextState.startTime - Math.floor(Date.now() / 1000) > 30 * 60
        ? -30 * 60
        : 0;
    const nextTargetTime: number =
      nextState[NicoliveProgramService.REFRESH_TARGET_TIME_TABLE[nextState.status]] +
      readyTimeTermIfReserved;
    const targetTimeUpdated = !statusUpdated && prevTargetTime !== nextTargetTime;

    const prev = prevState.status !== 'end';
    const next = nextState.status !== 'end';

    if (
      next &&
      (!prev ||
        programUpdated ||
        statusUpdated ||
        targetTimeUpdated ||
        nextState.status === 'reserved') // 予約中は30分前境界を越えたときに status が 'reserved' のまま変わらないためタイマーを再設定できていなかったので雑に予約中なら毎回設定する
    ) {
      const now = Date.now();
      const waitTime = (nextTargetTime + NicoliveProgramService.TIMER_PADDING_SECONDS) * 1000 - now;

      // 次に放送状態が変化する予定の時刻（より少し後）に放送情報を更新するタイマーを仕込む
      clearTimeout(this.refreshProgramTimer);
      this.refreshProgramTimer = window.setTimeout(() => {
        this.refreshProgram();
      }, waitTime);
    } else if (prev && !next) {
      clearTimeout(this.refreshProgramTimer);
    }
  }

  private autoExtensionTimer = 0;
  refreshAutoExtensionTimer(
    prevState: INicoliveProgramState,
    nextState: INicoliveProgramState,
  ): void {
    const now = Date.now();
    const endTimeUpdated = prevState.endTime !== nextState.endTime;

    /** 更新前の状態でタイマーが動作しているべきか */
    const prev =
      prevState.autoExtensionEnabled && NicoliveProgramService.isProgramExtendable(prevState);
    /** 更新後の状態でタイマーが動作しているべきか */
    const next =
      nextState.autoExtensionEnabled && NicoliveProgramService.isProgramExtendable(nextState);

    // 動作すべき状態になる OR 終了時刻が変わったら再設定
    if ((next && !prev) || (next && endTimeUpdated)) {
      clearTimeout(this.autoExtensionTimer);
      const timeout = (nextState.endTime - 5 * 60) * 1000 - now;
      // 5分前をすでに過ぎていたら即延長
      if (timeout <= 0) {
        this.extendProgramForAutoExtension(nextState);
      } else {
        this.autoExtensionTimer = window.setTimeout(() => {
          this.extendProgramForAutoExtension(nextState);
        }, timeout);
        console.log(
          '自動延長タイマーが（再）設定されました ',
          Math.floor(((nextState.endTime - 5 * 60) * 1000 - now) / 1000),
          '秒後に自動延長します',
        );
      }
      return;
    }

    // 動作すべきでない状態になるなら解除
    if (prev && !next) {
      clearTimeout(this.autoExtensionTimer);
      console.log('自動延長タイマーが解除されました');
    }
  }

  private async extendProgramForAutoExtension(state: INicoliveProgramState) {
    try {
      return await this.internalExtendProgram(state);
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    }
  }

  togglePanelOpened(): void {
    this.stateService.togglePanelOpened();
  }

  checkNameplateHint(commentNo: number) {
    if (this.stateService.state.nameplateHint === undefined) {
      this.stateService.updateNameplateHint({ programID: this.state.programID, commentNo });
    }
  }
}
