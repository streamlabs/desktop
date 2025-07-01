import { BehaviorSubject, Subject } from 'rxjs';
import { jest_fn } from 'util/jest_fn';
import { createSetupFunction } from 'util/test-setup';
import { type ICustomizationSettings } from './customization';
import { type IState } from './nicolive-program/state';
import {
  type MainWindowOperation,
  type PanelState,
  type WindowSizeService as WindowSizeServiceType,
} from './window-size';

const setup = createSetupFunction({
  state: {},
  injectee: {
    NicoliveProgramStateService: {
      state: {},
      updated: {
        subscribe() {},
      },
    },
    UserService: {
      userLoginState: {
        subscribe() {},
      },
      isLoggedIn: () => true,
    },
    CustomizationService: {
      settingsChanged: {
        subscribe() {},
      },
      state: {},
      setFullModeWidthOffset() {},
    },
    NavigationService: {
      navigated: {
        subscribe() {},
      },
      state: { currentPage: 'Studio' },
    },
  },
});

function target(options: { dummyMainWindowOperation?: boolean } = {}): {
  WindowSizeService: typeof WindowSizeServiceType;
} {
  const WindowSizeService = require('./window-size')
    .WindowSizeService as typeof WindowSizeServiceType;

  if (options.dummyMainWindowOperation) {
    WindowSizeService.mainWindowOperation = {
      getPosition: () => [0, 0],
      setPosition() {},
      getSize: () => [800, 600],
      setSize() {},
      getMinimumSize: () => [800, 600],
      setMinimumSize() {},
      setMaximumSize() {},
      isMaximized: () => false,
      maximize() {},
      unmaximize() {},
      setMaximizable() {},
      setAlwaysOnTop: jest.fn,
      isAlwaysOnTop: () => false,
    } as MainWindowOperation;
  }
  return { WindowSizeService };
}

jest.mock('services/user', () => ({ UserService: {} }));
jest.mock('services/nicolive-program/state', () => ({ NicoliveProgramStateService: {} }));

beforeEach(() => {
  jest.doMock('services/core/stateful-service');
  jest.doMock('services/core/injector');
});

afterEach(() => {
  jest.resetModules();
});

test('get instance', () => {
  setup();
  const { WindowSizeService } = target({ dummyMainWindowOperation: true });
  expect(WindowSizeService.instance).toBeInstanceOf(WindowSizeService);
});

describe('static getPanelState', () => {
  const suites: [boolean | null, boolean | null, boolean | null, boolean, string | null][] = [
    // panelOpen, isLoggedIn, isCompact, isMaximized, expected
    [null, null, null, false, null],
    [null, true, null, false, null],
    [null, false, null, false, null],
    [true, null, null, false, null],
    [false, null, null, false, null],
    [true, false, false, false, 'INACTIVE'],
    [false, false, false, false, 'INACTIVE'],
    [true, true, false, false, 'OPENED'],
    [false, true, false, false, 'CLOSED'],
    [true, false, true, false, 'COMPACT'],
    [false, false, true, false, 'COMPACT'],
    [true, true, true, false, 'COMPACT'],
    [false, true, true, false, 'COMPACT'],
    [true, true, false, true, 'INACTIVE'],
    [false, true, false, true, 'INACTIVE'],
    [true, false, true, true, 'INACTIVE'],
    [false, false, true, true, 'INACTIVE'],
    [true, true, true, true, 'INACTIVE'],
    [false, true, true, true, 'INACTIVE'],
  ];

  for (const [panelOpened, isLoggedIn, isCompact, isNavigating, result] of suites) {
    test(`panelOpened: ${panelOpened}, isLoggedIn: ${isLoggedIn}`, () => {
      setup();
      const { WindowSizeService } = target();

      expect(
        WindowSizeService.getPanelState({ panelOpened, isLoggedIn, isCompact, isNavigating }),
      ).toBe(result);
    });
  }
});

// TODO fix
describe('refreshWindowSize', () => {
  const suites = [
    {
      persistentIsLoggedIn: true,
      persistentPanelOpened: true,
      isLoggedIn: true,
      states: ['OPENED'],
    },
    {
      persistentIsLoggedIn: true,
      persistentPanelOpened: true,
      isLoggedIn: false,
      states: ['OPENED', 'INACTIVE'],
    },
    {
      persistentIsLoggedIn: true,
      persistentPanelOpened: false,
      isLoggedIn: true,
      states: ['CLOSED'],
    },
    {
      persistentIsLoggedIn: true,
      persistentPanelOpened: false,
      isLoggedIn: false,
      states: ['CLOSED', 'INACTIVE'],
    },
    {
      persistentIsLoggedIn: false,
      persistentPanelOpened: true,
      isLoggedIn: true,
      states: ['INACTIVE', 'OPENED'],
    },
    {
      persistentIsLoggedIn: false,
      persistentPanelOpened: false,
      isLoggedIn: true,
      states: ['INACTIVE', 'CLOSED'],
    },
  ] as {
    persistentIsLoggedIn: boolean;
    persistentPanelOpened: boolean;
    isLoggedIn: boolean;
    states: PanelState[];
  }[];

  for (const suite of suites) {
    const name = [
      suite.persistentIsLoggedIn ? 'ログイン中' : '未ログイン',
      'で',
      suite.persistentPanelOpened ? 'パネル展開状態' : 'パネル収納状態',
      'を復元し、',
      ['ログインチェックに失敗', 'ログインチェックに成功', '手動ログイン', 'ログインせず'][
        (suite.persistentIsLoggedIn ? 0 : 2) + (suite.isLoggedIn ? 1 : 0)
      ],
      ' → ',
      suite.states.join('/'),
    ].join('');
    test(name, async () => {
      const userLoginState = new Subject();
      const updated = new BehaviorSubject({
        panelOpened: suite.persistentPanelOpened,
      });
      setup({
        injectee: {
          UserService: {
            userLoginState,
            isLoggedIn: () => suite.persistentIsLoggedIn,
          },
          NicoliveProgramStateService: {
            state: {},
            updated,
          },
          NavigationService: {
            navigated: new Subject(),
            state: { currentPage: 'Studio' },
          },
        },
      });

      const { WindowSizeService } = target();
      const updateWindowSize = jest_fn<(typeof WindowSizeService)['updateWindowSize']>();
      // inject spy
      WindowSizeService.updateWindowSize = updateWindowSize;

      const sendSync = jest.fn().mockName('sendSync');
      jest.spyOn(require('electron').ipcRenderer, 'sendSync').mockImplementation(sendSync);

      // kick getter
      const windowSizeService: WindowSizeServiceType = WindowSizeService.instance;

      userLoginState.next(suite.isLoggedIn);

      // wait for stateChange to be ready
      await windowSizeService.waitReady();

      const firstCall = 1;
      suite.states.forEach((item, index, arr) => {
        if (index < firstCall) return;
        expect(updateWindowSize).toHaveBeenNthCalledWith(
          index + 1 - firstCall,
          expect.anything(),
          arr[index - 1] || item,
          item,
          {
            backupHeight: undefined,
            backupX: undefined,
            backupY: undefined,
            widthOffset: undefined,
          },
        );
      });
      expect(updateWindowSize).toHaveBeenCalledTimes(suite.states.length - firstCall);
    });
  }
});

describe('updateWindowSize', () => {
  const states = ['INACTIVE', 'OPENED', 'CLOSED'] as (PanelState | null)[];
  const stateName = {
    null: '初期',
    INACTIVE: '未ログイン',
    OPENED: 'パネル展開',
    CLOSED: 'パネル収納',
    COMPACT: 'コンパクトモード',
  };
  const BASE_HEIGHT = 600;
  const BASE_WIDTH = 800;
  const SMALL_WIDTH = BASE_WIDTH - 1; // 800より小さくしておくと便利

  const initSuites: {
    prev: PanelState | null;
    next: PanelState;
    smallerThanMinWidth: boolean;
  }[] = [
    [null, 'INACTIVE', true],
    [null, 'INACTIVE', false],
    [null, 'CLOSED', true],
    [null, 'CLOSED', false],
    [null, 'OPENED', true],
    [null, 'OPENED', false],
  ].map(([prev, next, smallerThanMinWidth]) => ({
    prev: prev as PanelState | null,
    next: next as PanelState,
    smallerThanMinWidth: smallerThanMinWidth as boolean,
  }));

  for (const suite of initSuites) {
    test(`${stateName[suite.prev]}→${stateName[suite.next]} 最小幅より${
      suite.smallerThanMinWidth ? '小さい' : '大きい'
    }`, () => {
      setup();
      const { WindowSizeService } = target();
      const { WINDOW_MIN_WIDTH } = WindowSizeService;
      const WIDTH = suite.smallerThanMinWidth
        ? SMALL_WIDTH
        : WINDOW_MIN_WIDTH[suite.next] || BASE_WIDTH;

      const win = {
        getMinimumSize: () => [WINDOW_MIN_WIDTH[suite.prev], BASE_HEIGHT],
        getSize: () => [WIDTH, BASE_HEIGHT],
        setMinimumSize: jest.fn(),
        setMaximumSize: jest.fn(),
        setSize: jest.fn(),
        isMaximized: () => false,
        setMaximizable: () => {},
      } as unknown as MainWindowOperation;

      WindowSizeService.updateWindowSize(win, suite.prev, suite.next, undefined);
      expect(win.setMinimumSize).toHaveBeenCalledTimes(1);
      expect(win.setMinimumSize).toHaveBeenNthCalledWith(
        1,
        WINDOW_MIN_WIDTH[suite.next],
        BASE_HEIGHT,
      );

      if (suite.smallerThanMinWidth) {
        expect(win.setSize).toHaveBeenCalledTimes(1);
        expect(win.setSize).toHaveBeenNthCalledWith(1, WINDOW_MIN_WIDTH[suite.next], BASE_HEIGHT);
      } else {
        expect(win.setSize).toHaveBeenCalledTimes(0);
      }
    });
  }

  const suites = [
    ['INACTIVE', 'CLOSED', false, true],
    ['INACTIVE', 'OPENED', false, true],
    ['CLOSED', 'OPENED', false, true],
    ['OPENED', 'CLOSED', false, false],
    ['OPENED', 'INACTIVE', false, false],
    ['CLOSED', 'INACTIVE', false, false],
    ['INACTIVE', 'CLOSED', true, false],
    ['INACTIVE', 'OPENED', true, false],
    ['CLOSED', 'OPENED', true, false],
    ['OPENED', 'CLOSED', true, false],
    ['OPENED', 'INACTIVE', true, false],
    ['CLOSED', 'INACTIVE', true, false],
  ].map(([prev, next, isMaximized, called]) => ({
    prev: prev as PanelState,
    next: next as PanelState,
    isMaximized: isMaximized as boolean,
    called: called as boolean,
  }));
  const WIDTH_DIFF = 0;

  for (const suite of suites) {
    test(`${stateName[suite.prev]}→${stateName[suite.next]} ${
      suite.isMaximized ? '最大化中は幅が変わらない' : '変化量を維持して幅を更新する'
    } setSize_called:${suite.called ? 'yes' : 'no'}`, () => {
      setup();
      const { WindowSizeService } = target();
      const { WINDOW_MIN_WIDTH } = WindowSizeService;

      const win = {
        getMinimumSize: () => [WINDOW_MIN_WIDTH[suite.prev], BASE_HEIGHT],
        getSize: () => [WINDOW_MIN_WIDTH[suite.prev] + WIDTH_DIFF, BASE_HEIGHT],
        setMinimumSize: jest.fn(),
        setMaximumSize: jest.fn(),
        setSize: jest.fn(),
        isMaximized: () => suite.isMaximized,
        setMaximizable: jest.fn(),
      } as unknown as MainWindowOperation;

      WindowSizeService.updateWindowSize(win, suite.prev, suite.next, undefined);

      expect(win.setMinimumSize).toHaveBeenCalledTimes(1);
      expect(win.setMinimumSize).toHaveBeenNthCalledWith(
        1,
        WINDOW_MIN_WIDTH[suite.next],
        BASE_HEIGHT,
      );

      if (!suite.called) {
        expect(win.setSize).toHaveBeenCalledTimes(0);
      } else {
        expect(win.setSize).toHaveBeenCalledTimes(1);
        expect(win.setSize).toHaveBeenNthCalledWith(
          1,
          WINDOW_MIN_WIDTH[suite.next] + WIDTH_DIFF,
          BASE_HEIGHT,
        );
      }
    });
  }

  const compactSuites = [
    ['INACTIVE', 'COMPACT', true, false, true, false],
    ['CLOSED', 'COMPACT', true, false, true, false],
    ['OPENED', 'COMPACT', true, false, true, false],
    ['COMPACT', 'INACTIVE', false, true, false, true],
    ['COMPACT', 'CLOSED', false, true, false, true],
    ['COMPACT', 'OPENED', false, true, false, true],
    ['INACTIVE', 'COMPACT', false, false, false, false],
    ['CLOSED', 'COMPACT', false, false, false, false],
    ['OPENED', 'COMPACT', false, false, false, false],
    ['COMPACT', 'INACTIVE', false, false, false, false],
    ['COMPACT', 'CLOSED', false, false, false, false],
    ['COMPACT', 'OPENED', false, false, false, false],
  ].map(([prev, next, isMaximized, maximize, unmaximize, backupMaximized]) => ({
    prev: prev as PanelState,
    next: next as PanelState,
    isMaximized: isMaximized as boolean,
    maximize: maximize as boolean,
    unmaximize: unmaximize as boolean,
    backupMaximized: backupMaximized as boolean,
  }));

  for (const suite of compactSuites) {
    test(`${stateName[suite.prev]}${suite.isMaximized ? '(最大化状態)' : ''}→${
      stateName[suite.next]
    }${suite.backupMaximized ? '(最大化保存状態)' : ''} 最大化切り替え管理`, () => {
      setup();
      const { WindowSizeService } = target();
      const { WINDOW_MIN_WIDTH } = WindowSizeService;

      const win = {
        getMinimumSize: () => [WINDOW_MIN_WIDTH[suite.prev], BASE_HEIGHT],
        getPosition: () => [0, 0],
        getSize: () => [WINDOW_MIN_WIDTH[suite.prev] + WIDTH_DIFF, BASE_HEIGHT],
        setMinimumSize: jest.fn(),
        setMaximumSize: jest.fn(),
        setSize: jest.fn(),
        isMaximized: () => suite.isMaximized,
        maximize: jest.fn(),
        unmaximize: jest.fn(),
        setMaximizable: jest.fn(),
        setAlwaysOnTop: jest.fn(),
      } as unknown as MainWindowOperation;

      const nextSize = WindowSizeService.updateWindowSize(win, suite.prev, suite.next, {
        maximized: suite.backupMaximized,
      } as any);

      expect(nextSize.maximized).toEqual(suite.isMaximized);

      expect(win.maximize).toHaveBeenCalledTimes(suite.maximize ? 1 : 0);
      expect(win.unmaximize).toHaveBeenCalledTimes(suite.unmaximize ? 1 : 0);
      expect(win.setMaximizable).toHaveBeenCalledWith(suite.next !== 'COMPACT');
    });
  }
});

describe('isAlwaysOnTop', () => {
  // programStateService.state.panelOpened, customizationService.state.compactMode と customizationService.state.compactAlwaysOnTop の組み合わせを列挙し、
  // panelOpened !== null && compactMode && compactAlwaysOnTop のときにのみ、
  // WindowsSizeService.state.isAlwaysOnTop が true になる(それ以外はfalse)
  // 初期化時と、変化時のパターンをテストする

  type InputTuple = [null | boolean, boolean, boolean, boolean];
  const inputPatterns = [null, true].flatMap(panelOpened =>
    [false, true].flatMap(compactMode =>
      [false, true].map(
        compactAlwaysOnTop =>
          [
            panelOpened,
            compactMode,
            compactAlwaysOnTop,
            panelOpened !== null && compactMode && compactAlwaysOnTop, // expected isAlwaysOnTop
          ] as InputTuple,
      ),
    ),
  );

  type CombinationTuple = [...InputTuple, ...InputTuple];
  const combinations: CombinationTuple[] = inputPatterns.flatMap(inits => {
    const [panelOpened, compactMode, compactAlwaysOnTop, expected] = inits;
    // init と next で一致しないものについてテストする
    return inputPatterns
      .filter(([nextPanelOpened, nextCompactMode, nextCompactAlwaysOnTop]) => {
        return (
          nextPanelOpened !== panelOpened ||
          nextCompactMode !== compactMode ||
          nextCompactAlwaysOnTop !== compactAlwaysOnTop
        );
      })
      .map(
        ([nextPanelOpened, nextCompactMode, nextCompactAlwaysOnTop, nextExpected]) =>
          [
            panelOpened,
            compactMode,
            compactAlwaysOnTop,
            expected,
            nextPanelOpened,
            nextCompactMode,
            nextCompactAlwaysOnTop,
            nextExpected,
          ] as CombinationTuple,
      );
  });

  test.each(combinations)(
    '[panelOpened, compactMode, compactAlwaysOnTop, expected]: init(%p, %p, %p, %p) -> next(%p, %p, %p, %p)',
    (
      initPanelOpened,
      initCompactMode,
      initCompactAlwaysOnTop,
      initExpected,
      nextPanelOpened,
      nextCompactMode,
      nextCompactAlwaysOnTop,
      nextExpected,
    ) => {
      const programState: Partial<IState> = {
        panelOpened: initPanelOpened,
      };
      const programStateSubject = new BehaviorSubject(programState);

      const settingsChanged = new Subject<Partial<ICustomizationSettings>>();
      setup({
        injectee: {
          NicoliveProgramStateService: {
            state: programState,
            updated: programStateSubject.asObservable(),
          },
          CustomizationService: {
            state: {
              compactMode: initCompactMode,
              compactAlwaysOnTop: initCompactAlwaysOnTop,
            } as Partial<ICustomizationSettings>,
            settingsChanged,
            setFullModeWidthOffset() {},
          },
        },
      });

      const { WindowSizeService } = target({ dummyMainWindowOperation: true });
      const instance = WindowSizeService.instance as WindowSizeServiceType;

      expect(instance.state.isCompact).toBe(initCompactMode);
      expect(instance.state.isAlwaysOnTop).toBe(initExpected);

      const nextState = (next: Partial<ICustomizationSettings>) => {
        instance.customizationService.state = { ...instance.customizationService.state, ...next };
        settingsChanged.next(next);
      };

      if (initPanelOpened !== nextPanelOpened) {
        instance.nicoliveProgramStateService.state = {
          ...instance.nicoliveProgramStateService.state,
          panelOpened: nextPanelOpened,
        };
        programStateSubject.next({ panelOpened: nextPanelOpened });
        expect(instance.state.panelOpened).toBe(nextPanelOpened);
      }
      if (initCompactMode !== nextCompactMode) {
        nextState({ compactMode: nextCompactMode });
        expect(instance.state.isCompact).toBe(nextCompactMode);
      }
      if (initCompactAlwaysOnTop !== nextCompactAlwaysOnTop) {
        nextState({ compactAlwaysOnTop: nextCompactAlwaysOnTop });
      }
      expect(instance.state.isAlwaysOnTop).toBe(nextExpected);
    },
  );
});
