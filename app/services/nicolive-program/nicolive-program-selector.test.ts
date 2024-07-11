import { createSetupFunction } from 'util/test-setup';
import { Subject } from 'rxjs';
import { NicoliveProgramSelectorService, TStep, TProviderType } from './nicolive-program-selector';
import { OnairChannelData, OnairChannelProgramData } from './ResponseTypes';

const setup = createSetupFunction({
  injectee: {
    NicoliveProgramSelectorService: {
      stateChange: new Subject(),
    },
  },
});

function createInstance() {
  const { NicoliveProgramSelectorService } = require('./nicolive-program-selector');
  const instance = NicoliveProgramSelectorService.instance as NicoliveProgramSelectorService;
  instance.client.fetchOnairChannels = jest.fn().mockResolvedValue({
    ok: true,
    value: [
      {
        id: 'ch1',
        thumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        name: 'テスト用チャンネル1',
      },
      {
        id: 'ch2',
        thumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        name: 'テスト用チャンネル2',
      },
    ] as OnairChannelData[],
  });
  instance.client.fetchOnairChannelProgram = jest.fn().mockResolvedValue({
    ok: true,
    value: {
      testProgramId: 'lv1111111111',
      programId: 'lv2222222222',
    } as OnairChannelProgramData,
  });
  instance.client.fetchProgram = jest.fn().mockImplementation((programId: string) =>
    Promise.resolve({
      ok: true,
      value: {
        title: `これは ${programId} のタイトルです`,
      },
    }),
  );
  return instance;
}

beforeEach(() => {
  jest.doMock('services/core/stateful-service');
  jest.doMock('services/core/injector');
  jest.mock('util/menus/Menu', () => ({}));
  jest.mock('services/sources');
  jest.mock('services/i18n', () => ({
    $t: (x: any) => x,
  }));
  jest.mock('@electron/remote', () => ({
    BrowserWindow: jest.fn(),
  }));
});

afterEach(() => {
  jest.resetModules();
});

test('ユーザー番組を選んで配信開始のための番組情報を準備できる', async () => {
  setup();
  const instance = createInstance();
  expect(instance.state.currentStep).toBe('providerTypeSelect');

  // 確認へ
  await instance.onSelectProviderType('user');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('user');
  expect(instance.state.selectedChannel).toBeNull();
  expect(instance.state.selectedChannelProgram).toBeNull();
});

test('チャンネル番組を選んで配信開始のための番組情報を準備できる', async () => {
  setup();
  const instance = createInstance();
  expect(instance.state.currentStep).toBe('providerTypeSelect');

  // チャンネル選択へ
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('channelSelect');
  expect(instance.state.selectedProviderType).toBe('channel');

  // 番組選択へ
  const selectedChannelId = 'ch9999';
  const selectedChannelName = 'チャンネルああああ';
  await instance.onSelectChannel(selectedChannelId, selectedChannelName);
  expect(instance.state.currentStep).toBe('programSelect');
  expect(instance.state.selectedChannel).toMatchObject({
    id: selectedChannelId,
    name: selectedChannelName,
  });
  expect(instance.state.candidatePrograms[0].id).toBe('lv1111111111');
  expect(instance.state.candidatePrograms[0].title).toBe('これは lv1111111111 のタイトルです');
  expect(instance.state.candidatePrograms[1].id).toBe('lv2222222222');
  expect(instance.state.candidatePrograms[1].title).toBe('これは lv2222222222 のタイトルです');

  // 確認へ
  const selectedProgramId = 'lv1111';
  const selectedProgramTitle = '番組いいいい';
  instance.onSelectBroadcastingProgram(selectedProgramId, selectedProgramTitle);
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('channel');
  expect(instance.state.selectedChannel).toMatchObject({
    id: selectedChannelId,
    name: selectedChannelName,
  });
  expect(instance.state.selectedChannelProgram).toMatchObject({
    id: selectedProgramId,
    title: selectedProgramTitle,
  });
});

test('番組選択ステップで, チャンネルや番組の選択をしようとしても何も起きない.', async () => {
  setup();
  const instance = createInstance();
  expect(instance.state.currentStep).toBe('providerTypeSelect');

  // チャンネル選択ができない
  await instance.onSelectChannel('ch1', 'name');
  expect(instance.state.currentStep).toBe('providerTypeSelect');
  expect(instance.state.selectedChannel).toBeNull();

  // 番組選択ができない
  instance.onSelectBroadcastingProgram('lv1', 'title');
  expect(instance.state.currentStep).toBe('providerTypeSelect');
  expect(instance.state.selectedChannelProgram).toBeNull();
});

test('チャンネル選択ステップで, 配信種別や番組の選択をしようとしても何も起きない. ', async () => {
  setup();
  const instance = createInstance();
  expect(instance.state.currentStep).toBe('providerTypeSelect');

  // チャンネル選択へ
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('channelSelect');
  expect(instance.state.selectedProviderType).toBe('channel');

  // 配信種別をチャンネルに変更しようとしても何も起きない
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('channelSelect');
  expect(instance.state.selectedProviderType).toBe('channel');

  // 配信種別をユーザー番組に変更できない
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('channelSelect');
  expect(instance.state.selectedProviderType).toBe('channel');

  // 番組を選択できない
  instance.onSelectBroadcastingProgram('lv1', 'title');
  expect(instance.state.currentStep).toBe('channelSelect');
  expect(instance.state.selectedChannelProgram).toBeNull();
});

test('番組選択ステップで, 配信種別やチャンネルの選択をしようとしても何も起きない.', async () => {
  setup();
  const instance = createInstance();
  expect(instance.state.currentStep).toBe('providerTypeSelect');

  // チャンネル選択へ
  await instance.onSelectProviderType('channel');

  // 番組選択へ
  const selectedChannelId = 'ch9999';
  await instance.onSelectChannel(selectedChannelId, 'チャンネルああああ');
  expect(instance.state.currentStep).toBe('programSelect');

  // 配信種別をチャンネルに変更しようとしても何も起きない
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('programSelect');
  expect(instance.state.selectedProviderType).toBe('channel');

  // 配信種別をユーザー番組に変更できない
  await instance.onSelectProviderType('user');
  expect(instance.state.currentStep).toBe('programSelect');
  expect(instance.state.selectedProviderType).toBe('channel');

  // チャンネルを選択しようとしても何も起きない
  instance.onSelectChannel('ch100000000', 'name');
  expect(instance.state.currentStep).toBe('programSelect');
  expect(instance.state.selectedChannel.id).toBe(selectedChannelId);
});

test('ユーザー番組の確認ステップでは, あらゆる設定済の項目を変更することはできない.', async () => {
  setup();
  const instance = createInstance();
  expect(instance.state.currentStep).toBe('providerTypeSelect');

  // 確認へ
  await instance.onSelectProviderType('user');
  expect(instance.state.currentStep).toBe('confirm');

  // 配信種別をチャンネルに変更できない
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('user');

  // 配信種別をユーザーに変更しようとしても何も起きない
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('user');

  // チャンネルを選択しようとしても何も起きない
  await instance.onSelectChannel('ch1111', 'name');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('user');
  expect(instance.state.selectedChannel).toBeNull();

  // 番組を選択しようとしても変更できない
  instance.onSelectBroadcastingProgram('lv1111', 'title');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('user');
  expect(instance.state.selectedChannel).toBeNull();
});

test('チャンネル番組の確認ステップでは, あらゆる設定済の項目を変更することはできない', async () => {
  setup();
  const instance = createInstance();
  expect(instance.state.currentStep).toBe('providerTypeSelect');
  // チャンネル選択へ
  await instance.onSelectProviderType('channel');

  // 番組選択へ
  const selectedChannelId = 'ch9999';
  await instance.onSelectChannel(selectedChannelId, 'チャンネルああああ');

  // 確認へ
  const selectedProgram = 'lv1111';
  instance.onSelectBroadcastingProgram(selectedProgram, 'タイトル');
  expect(instance.state.currentStep).toBe('confirm');

  // 配信種別をチャンネルに変更しようとしても何も起きない
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('channel');

  // 配信種別をユーザーに変更できない
  await instance.onSelectProviderType('channel');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('channel');

  // チャンネルを選択しようとしても変更できない
  await instance.onSelectChannel('ch1111', 'name');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('channel');
  expect(instance.state.selectedChannel.id).toBe(selectedChannelId);

  // 番組を選択しようとしても変更できない
  instance.onSelectBroadcastingProgram('lv2222', 'title');
  expect(instance.state.currentStep).toBe('confirm');
  expect(instance.state.selectedProviderType).toBe('channel');
  expect(instance.state.selectedChannelProgram.id).toBe(selectedProgram);
});

describe('ステップ比較系メソッド', () => {
  // 指定ステップの状態のインスタンスを作るユーティリティ
  async function createServiceInstanceByStep(step: TStep, providerType: TProviderType) {
    setup();
    const instance = createInstance();
    if (providerType === 'user') {
      switch (step) {
        case 'providerTypeSelect':
          return instance;
        case 'confirm':
          await instance.onSelectProviderType('user');
          return instance;
        default:
          throw new Error('作れません');
      }
    } else {
      switch (step) {
        case 'providerTypeSelect':
          return instance;
        case 'channelSelect':
          await instance.onSelectProviderType('channel');
          return instance;
        case 'programSelect':
          await instance.onSelectProviderType('channel');
          await instance.onSelectChannel('ch9999', 'name');
          return instance;
        case 'confirm':
          await instance.onSelectProviderType('channel');
          await instance.onSelectChannel('ch9999', 'name');
          instance.onSelectBroadcastingProgram('id', 'title');
          return instance;
      }
    }
  }
  describe('isCompletedOrCurrentStep', () => {
    test('providerTypeSelect ステップのインスタンスに対して正しい値を返す', async () => {
      // 初期状態なので, 'user' でも同様.
      const instance = await createServiceInstanceByStep('providerTypeSelect', 'channel');
      expect(instance.isCompletedOrCurrentStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('channelSelect')).toBe(false);
      expect(instance.isCompletedOrCurrentStep('programSelect')).toBe(false);
      expect(instance.isCompletedOrCurrentStep('confirm')).toBe(false);
    });
    test('channelSelect ステップのインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('channelSelect', 'channel');
      expect(instance.isCompletedOrCurrentStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('channelSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('programSelect')).toBe(false);
      expect(instance.isCompletedOrCurrentStep('confirm')).toBe(false);
    });
    test('programSelect ステップのインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('programSelect', 'channel');
      expect(instance.isCompletedOrCurrentStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('channelSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('programSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('confirm')).toBe(false);
    });
    test('confirm ステップ (チャンネル番組) のインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('confirm', 'channel');
      expect(instance.isCompletedOrCurrentStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('channelSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('programSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('confirm')).toBe(true);
    });
    test('confirm ステップ (ユーザー番組) のインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('confirm', 'user');
      expect(instance.isCompletedOrCurrentStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedOrCurrentStep('channelSelect')).toBe(false); // ユーザー番組は経由しない
      expect(instance.isCompletedOrCurrentStep('programSelect')).toBe(false); // ユーザー番組は経由しない
    });
  });
  describe('isCompletedStep', () => {
    test('providerTypeSelect ステップのインスタンスに対して正しい値を返す', async () => {
      // 初期状態なので, 'user' でも同様.
      const instance = await createServiceInstanceByStep('providerTypeSelect', 'channel');
      expect(instance.isCompletedStep('providerTypeSelect')).toBe(false);
      expect(instance.isCompletedStep('channelSelect')).toBe(false);
      expect(instance.isCompletedStep('programSelect')).toBe(false);
      expect(instance.isCompletedStep('confirm')).toBe(false);
    });
    test('channelSelect ステップのインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('channelSelect', 'channel');
      expect(instance.isCompletedStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedStep('channelSelect')).toBe(false);
      expect(instance.isCompletedStep('programSelect')).toBe(false);
      expect(instance.isCompletedStep('confirm')).toBe(false);
    });
    test('programSelect ステップのインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('programSelect', 'channel');
      expect(instance.isCompletedStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedStep('channelSelect')).toBe(true);
      expect(instance.isCompletedStep('programSelect')).toBe(false);
      expect(instance.isCompletedStep('confirm')).toBe(false);
    });
    test('confirm ステップ (チャンネル番組) のインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('confirm', 'channel');
      expect(instance.isCompletedStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedStep('channelSelect')).toBe(true);
      expect(instance.isCompletedStep('programSelect')).toBe(true);
      expect(instance.isCompletedStep('confirm')).toBe(false);
    });
    test('confirm ステップ (ユーザー番組) のインスタンスに対して正しい値を返す', async () => {
      const instance = await createServiceInstanceByStep('confirm', 'user');
      expect(instance.isCompletedStep('providerTypeSelect')).toBe(true);
      expect(instance.isCompletedStep('channelSelect')).toBe(false); // ユーザー番組は経由しない
      expect(instance.isCompletedStep('programSelect')).toBe(false); // ユーザー番組は経由しない
      expect(instance.isCompletedStep('confirm')).toBe(false);
    });
  });
  describe('backTo', () => {
    const expectedChannels = [
      {
        id: 'ch1',
        name: 'テスト用チャンネル1',
        thumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
      },
      {
        id: 'ch2',
        name: 'テスト用チャンネル2',
        thumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
      },
    ];
    describe('providerTypeSelect ステップのインスタンスに対して呼び出しても何も起こらない', () => {
      test('どの状態に戻ろうとしても何も起こらない', async () => {
        const instance = await createServiceInstanceByStep('providerTypeSelect', 'channel');
        (instance as any).SET_STATE = jest.fn();
        instance.backTo('providerTypeSelect');
        instance.backTo('channelSelect');
        instance.backTo('programSelect');
        instance.backTo('confirm');
        expect((instance as any).SET_STATE).not.toBeCalled();
      });
    });
    describe('broadcastChanelSelect ステップのインスタンスに対して状態をクリアできる', () => {
      test('providerTypeSelect ステップに戻るときに適切な状態に初期化できる', async () => {
        const instance = await createServiceInstanceByStep('channelSelect', 'channel');
        instance.backTo('providerTypeSelect');
        expect(instance.state).toMatchObject({
          currentStep: 'providerTypeSelect',
          candidateChannels: [],
          candidatePrograms: [],
          selectedProviderType: null,
          selectedChannel: null,
          selectedChannelProgram: null,
        });
      });
      test('その他のステップに戻ろうとしても何も起こらない', async () => {
        const instance = await createServiceInstanceByStep('channelSelect', 'channel');
        (instance as any).SET_STATE = jest.fn();
        instance.backTo('channelSelect');
        instance.backTo('programSelect');
        instance.backTo('confirm');
        expect((instance as any).SET_STATE).not.toBeCalled();
      });
    });
    describe('programSelect ステップのインスタンスに対して状態をクリアできる', () => {
      test('providerTypeSelect ステップに戻るときに適切な状態に初期化できる', async () => {
        const instance = await createServiceInstanceByStep('programSelect', 'channel');
        instance.backTo('providerTypeSelect');
        expect(instance!.state).toMatchObject({
          currentStep: 'providerTypeSelect',
          candidateChannels: [],
          candidatePrograms: [],
          selectedProviderType: null,
          selectedChannel: null,
          selectedChannelProgram: null,
        });
      });
      test('channelSelect ステップに戻るときに適切な状態に初期化できる', async () => {
        const instance = await createServiceInstanceByStep('programSelect', 'channel');
        instance.backTo('channelSelect');
        expect(instance.state).toMatchObject({
          currentStep: 'channelSelect',
          candidateChannels: expectedChannels,
          candidatePrograms: [],
          selectedProviderType: 'channel',
          selectedChannel: null,
          selectedChannelProgram: null,
        });
      });
      test('その他のステップに戻ろうとしても何も起こらない', async () => {
        const instance = await createServiceInstanceByStep('programSelect', 'channel');
        (instance as any).SET_STATE = jest.fn();
        instance.backTo('programSelect');
        instance.backTo('confirm');
        expect((instance as any).SET_STATE).not.toBeCalled();
      });
    });
    describe('confirm ステップ (チャンネル番組) のインスタンスに対して状態をクリアできる', () => {
      test('providerTypeSelect ステップに戻るときに適切な状態に初期化できる', async () => {
        const instance = await createServiceInstanceByStep('confirm', 'channel');
        instance.backTo('providerTypeSelect');
        expect(instance.state).toMatchObject({
          currentStep: 'providerTypeSelect',
          candidateChannels: [],
          candidatePrograms: [],
          selectedProviderType: null,
          selectedChannel: null,
          selectedChannelProgram: null,
        });
      });
      test('channelSelect ステップに戻るときに適切な状態に初期化できる', async () => {
        const instance = await createServiceInstanceByStep('confirm', 'channel');
        instance.backTo('channelSelect');
        expect(instance.state).toMatchObject({
          currentStep: 'channelSelect',
          candidateChannels: expectedChannels,
          candidatePrograms: [],
          selectedProviderType: 'channel',
          selectedChannel: null,
          selectedChannelProgram: null,
        });
      });
      test('programSelect ステップに戻るときに適切な状態に初期化できる', async () => {
        const instance = await createServiceInstanceByStep('confirm', 'channel');
        instance.backTo('programSelect');
        expect(instance.state).toMatchObject({
          currentStep: 'programSelect',
          candidateChannels: expectedChannels,
          candidatePrograms: [
            { id: 'lv1111111111', title: 'これは lv1111111111 のタイトルです' },
            { id: 'lv2222222222', title: 'これは lv2222222222 のタイトルです' },
          ],
          selectedProviderType: 'channel',
          selectedChannel: { id: 'ch9999', name: 'name' },
          selectedChannelProgram: null,
        });
      });
      test('confirm ステップに戻ろうとしても何も起こらない', async () => {
        const instance = await createServiceInstanceByStep('confirm', 'channel');
        (instance as any).SET_STATE = jest.fn();
        instance.backTo('confirm');
        expect((instance as any).SET_STATE).not.toBeCalled();
      });
    });
    describe('confirm ステップ (ユーザー番組) のインスタンスに対して状態をクリアできる', () => {
      test('providerTypeSelect ステップに戻るときに適切な状態に初期化できる', async () => {
        const instance = await createServiceInstanceByStep('confirm', 'user');
        instance.backTo('providerTypeSelect');
        expect(instance.state).toMatchObject({
          currentStep: 'providerTypeSelect',
          candidateChannels: [],
          candidatePrograms: [],
          selectedProviderType: null,
          selectedChannel: null,
          selectedChannelProgram: null,
        });
      });
      test('他のステップに戻ろうとしても何も起こらない', async () => {
        const instance = await createServiceInstanceByStep('confirm', 'user');
        (instance as any).SET_STATE = jest.fn();
        instance.backTo('channelSelect'); // ユーザー番組ではスキップされるため無効
        instance.backTo('programSelect'); // ユーザー番組ではスキップされるため無効
        instance.backTo('confirm');
        expect((instance as any).SET_STATE).not.toBeCalled();
      });
    });
  });
});
