import { createSetupFunction } from 'util/test-setup';
import { Subject, BehaviorSubject } from 'rxjs';
import { type ICustomizationSettings } from './customization';
import { type IState } from './nicolive-program/state';

type PanelState = import('./window-size').PanelState;
type WindowSizeServiceType = import('./window-size').WindowSizeService;

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
  const { WindowSizeService } = require('./window-size');
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
      const { WindowSizeService } = require('./window-size');

      expect(
        WindowSizeService.getPanelState({ panelOpened, isLoggedIn, isCompact, isNavigating }),
      ).toBe(result);
    });
  }
});

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
  ];

  for (const suite of suites) {
    const name = [
      suite.persistentIsLoggedIn ? 'ログイン中' : '未ログイン',
      'で',
      suite.persistentPanelOpened ? 'パネル展開状態' : 'パネル収納状態',
      'を復元し、',
      ['ログインチェックに成功', 'ログインチェックに失敗', '手動ログイン', 'ログインせず'][
        (suite.persistentIsLoggedIn ? 0 : 2) + (suite.isLoggedIn ? 1 : 0)
      ],
      ' → ',
      suite.states.join('/'),
    ].join('');
    test(name, () => {
      const userLoginState = new Subject();
      const updated = new BehaviorSubject({
        panelOpened: suite.persistentPanelOpened,
      });
      const setMinimumSize = jest.fn();
      const setMaximumSize = jest.fn();
      const setSize = jest.fn();
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

      const { WindowSizeService } = require('./window-size');
      const updateWindowSize = jest.fn();
      // inject spy
      WindowSizeService.updateWindowSize = updateWindowSize;

      const sendSync = jest.fn().mockName('sendSync');
      jest.spyOn(require('electron').ipcRenderer, 'sendSync').mockImplementation(sendSync);

      // kick getter
      WindowSizeService.instance;

      userLoginState.next(suite.isLoggedIn);

      suite.states.forEach((item, index, arr) => {
        expect(updateWindowSize).toHaveBeenNthCalledWith(
          index + 1,
          expect.anything(),
          arr[index - 1] || null,
          item,
          {
            backupHeight: undefined,
            backupX: undefined,
            backupY: undefined,
            widthOffset: undefined,
          },
        );
      });
      expect(updateWindowSize).toHaveBeenCalledTimes(suite.states.length);
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
      const { WindowSizeService } = require('./window-size');
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
      };

      WindowSizeService.updateWindowSize(win, suite.prev, suite.next);
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
    ['INACTIVE', 'CLOSED', false],
    ['INACTIVE', 'OPENED', false],
    ['CLOSED', 'OPENED', false],
    ['OPENED', 'CLOSED', false],
    ['OPENED', 'INACTIVE', false],
    ['CLOSED', 'INACTIVE', false],
    ['INACTIVE', 'CLOSED', true],
    ['INACTIVE', 'OPENED', true],
    ['CLOSED', 'OPENED', true],
    ['OPENED', 'CLOSED', true],
    ['OPENED', 'INACTIVE', true],
    ['CLOSED', 'INACTIVE', true],
  ].map(([prev, next, isMaximized]) => ({
    prev: prev as PanelState,
    next: next as PanelState,
    isMaximized: isMaximized as boolean,
  }));
  const WIDTH_DIFF = 32;

  for (const suite of suites) {
    test(`${stateName[suite.prev]}→${stateName[suite.next]} ${
      suite.isMaximized ? '最大化中は幅が変わらない' : '変化量を維持して幅を更新する'
    }`, () => {
      setup();
      const { WindowSizeService } = require('./window-size');
      const { WINDOW_MIN_WIDTH } = WindowSizeService;

      const win = {
        getMinimumSize: () => [WINDOW_MIN_WIDTH[suite.prev], BASE_HEIGHT],
        getSize: () => [WINDOW_MIN_WIDTH[suite.prev] + WIDTH_DIFF, BASE_HEIGHT],
        setMinimumSize: jest.fn(),
        setMaximumSize: jest.fn(),
        setSize: jest.fn(),
        isMaximized: () => suite.isMaximized,
        setMaximizable: jest.fn(),
      };

      WindowSizeService.updateWindowSize(win, suite.prev, suite.next);

      expect(win.setMinimumSize).toHaveBeenCalledTimes(1);
      expect(win.setMinimumSize).toHaveBeenNthCalledWith(
        1,
        WINDOW_MIN_WIDTH[suite.next],
        BASE_HEIGHT,
      );

      if (suite.isMaximized) {
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
      const { WindowSizeService } = require('./window-size');
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
      };

      const nextSize = WindowSizeService.updateWindowSize(win, suite.prev, suite.next, {
        maximized: suite.backupMaximized,
      });

      expect(nextSize.maximized).toEqual(suite.isMaximized);

      expect(win.maximize).toHaveBeenCalledTimes(suite.maximize ? 1 : 0);
      expect(win.unmaximize).toHaveBeenCalledTimes(suite.unmaximize ? 1 : 0);
      expect(win.setMaximizable).toHaveBeenCalledWith(suite.next !== 'COMPACT');
    });
  }
});

describe('isAlwaysOnTop', () => {
  // customizationService.state.compactMode と customizationService.state.compactAlwaysOnTop の組み合わせを列挙し、
  // 両方true のときにのみ、 WindowsSizeService.state.isAlwaysOnTop が true になる(それ以外はfalse)
  // 初期化時と、変化時のパターンをテストする

  const inputPatterns = [false, true].flatMap(compactMode =>
    [false, true].map(
      compactAlwaysOnTop =>
        [
          compactMode,
          compactAlwaysOnTop,
          compactMode && compactAlwaysOnTop, // expected isAlwaysOnTop
        ] as [boolean, boolean, boolean],
    ),
  );

  const combinations: [boolean, boolean, boolean, boolean, boolean, boolean][] =
    inputPatterns.flatMap(inits => {
      const [compactMode, compactAlwaysOnTop, expected] = inits;
      // init と next で一致しないものについてテストする
      return inputPatterns
        .filter(([nextCompactMode, nextCompactAlwaysOnTop]) => {
          return nextCompactMode !== compactMode || nextCompactAlwaysOnTop !== compactAlwaysOnTop;
        })
        .map(
          ([nextCompactMode, nextCompactAlwaysOnTop, nextExpected]) =>
            [
              compactMode,
              compactAlwaysOnTop,
              expected,
              nextCompactMode,
              nextCompactAlwaysOnTop,
              nextExpected,
            ] as [boolean, boolean, boolean, boolean, boolean, boolean],
        );
    });

  test.each(combinations)(
    '[compactMode, compactAlwaysOnTop, expected]: init(%p, %p, %p) -> next(%p, %p, %p)',
    (
      initCompactMode,
      initCompactAlwaysOnTop,
      initExpected,
      nextCompactMode,
      nextCompactAlwaysOnTop,
      nextExpected,
    ) => {
      const programState: Partial<IState> = {
        panelOpened: true,
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

      jest
        .spyOn(require('electron').ipcRenderer, 'sendSync')
        .mockImplementation((_, command: string) => {
          switch (command) {
            case 'getMinimumSize':
            case 'getSize':
              return [800, 600];
          }
        });

      const { WindowSizeService } = require('./window-size');
      const instance = WindowSizeService.instance as WindowSizeServiceType;
      instance.mainWindowOperation = {
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
      };

      expect(instance.state.isCompact).toBe(initCompactMode);
      expect(instance.state.isAlwaysOnTop).toBe(initExpected);

      const nextState = (next: Partial<ICustomizationSettings>) => {
        instance.customizationService.state = { ...instance.customizationService.state, ...next };
        settingsChanged.next(next);
      };

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
