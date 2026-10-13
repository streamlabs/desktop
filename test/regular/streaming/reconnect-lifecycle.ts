import { focusMain, focusWindow } from '../../helpers/modules/core';
import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

type TContext = 'horizontal' | 'vertical' | 'enhancedBroadcasting';
type TSetup = 'single' | 'dual' | 'enhancedBroadcasting';

interface IScenarioSignal {
  signal: string;
  code: number;
  error: string;
}

interface IScenario {
  setup: TSetup;
  context: TContext;
  stages: Array<Array<string | IScenarioSignal>>;
  highlighter?: boolean;
  liveOutputEditing?: boolean;
  updatingDisplay?: 'horizontal' | 'vertical';
  retainedRestart?: {
    startupSignals: Array<string | IScenarioSignal>;
    stages: Array<Array<string | IScenarioSignal>>;
  };
  replaceHandlerWithQueuedSignals?: boolean;
}

interface ISnapshot {
  horizontal: string;
  vertical: string;
  stopped: string[];
  destroyed: string[];
  published: string[];
  highlighterRecordingStops: number;
  highlighterReplayStops: number;
  streamEndEvents: number;
  outputErrors: string[];
  recording: string;
  outputRetained: boolean;
  nativeStarts: number;
  goLiveRejected: boolean;
  updatingDisplays: string[];
  numInstances: number;
}

interface IScenarioResult {
  snapshots: ISnapshot[];
  error?: string;
}

test('Streaming reconnect preserves outputs through both deactivate signal orders', async t => {
  const setups: Array<{ setup: TSetup; context: TContext }> = [
    { setup: 'single', context: 'horizontal' },
    { setup: 'dual', context: 'horizontal' },
    { setup: 'dual', context: 'vertical' },
    { setup: 'enhancedBroadcasting', context: 'enhancedBroadcasting' },
  ];

  for (const setup of setups) {
    for (const signals of [
      ['reconnect', 'deactivate'],
      ['deactivate', 'reconnect'],
    ]) {
      const label = `${setup.setup}/${setup.context}: ${signals.join(', ')}`;
      const { snapshots, error } = await runScenario(t, {
        ...setup,
        highlighter: true,
        stages: [signals, ['activate', 'reconnect_success']],
      });
      t.falsy(error, label);
      const [retrying, recovered] = snapshots;
      const display = setup.context === 'vertical' ? 'vertical' : 'horizontal';

      t.is(retrying[display], 'reconnecting', label);
      t.false(retrying.published.includes('offline'), label);
      t.is(recovered[display], 'live', label);
      t.deepEqual(recovered.stopped, [], label);
      t.deepEqual(recovered.destroyed, [], label);
      t.is(recovered.highlighterRecordingStops, 0, label);
      t.is(recovered.highlighterReplayStops, 0, label);
      t.is(recovered.streamEndEvents, 0, label);
      t.deepEqual(recovered.outputErrors, [], label);
      if (setup.setup === 'dual') {
        t.is(retrying[display === 'horizontal' ? 'vertical' : 'horizontal'], 'live', label);
      }
    }
  }
});

test('Streaming terminal cleanup still stops the companion in both signal orders', async t => {
  for (const signals of [
    ['stop', 'deactivate'],
    ['deactivate', 'stop'],
  ]) {
    const label = signals.join(', ');
    const { snapshots, error } = await runScenario(t, {
      setup: 'dual',
      context: 'horizontal',
      highlighter: true,
      stages: signals.map(signal => [signal]),
    });
    t.falsy(error, label);
    const [pending, stopped] = snapshots;
    t.deepEqual(pending.stopped, [], label);
    t.deepEqual(pending.destroyed, [], label);
    t.is(pending.highlighterRecordingStops, 0, label);
    t.is(pending.highlighterReplayStops, 0, label);
    t.is(stopped.horizontal, 'offline', label);
    t.deepEqual(stopped.stopped, ['vertical'], label);
    t.true(stopped.destroyed.includes('horizontal/streaming'), label);
    t.is(stopped.highlighterRecordingStops, 1, label);
    t.is(stopped.highlighterReplayStops, 1, label);
    t.deepEqual(stopped.outputErrors, [], label);
  }
});

test('Live output editing waits for terminal stop and preserves the companion and highlighter', async t => {
  const displays: Array<'horizontal' | 'vertical'> = ['horizontal', 'vertical'];
  for (const context of displays) {
    for (const highlighter of [false, true]) {
      for (const signals of [
        ['stop', 'deactivate'],
        ['deactivate', 'stop'],
      ]) {
        const label = `${context}, highlighter=${highlighter}: ${signals.join(', ')}`;
        const companion = context === 'horizontal' ? 'vertical' : 'horizontal';
        const { snapshots, error } = await runScenario(t, {
          setup: 'dual',
          context,
          highlighter,
          liveOutputEditing: true,
          updatingDisplay: context,
          stages: [
            ['deactivate', 'reconnect'],
            ['activate', 'reconnect_success'],
            ...signals.map(signal => [signal]),
          ],
        });
        t.falsy(error, label);
        const [retrying, recovered, pending, stopped] = snapshots;
        t.is(retrying[context], 'reconnecting', label);
        t.is(recovered[context], 'live', label);
        for (const snapshot of [retrying, recovered, pending]) {
          t.deepEqual(snapshot.stopped, [], label);
          t.deepEqual(snapshot.destroyed, [], label);
          t.is(snapshot[companion], 'live', label);
          t.is(snapshot.highlighterRecordingStops, 0, label);
          t.is(snapshot.highlighterReplayStops, 0, label);
          t.deepEqual(snapshot.updatingDisplays, [context], label);
          t.is(snapshot.numInstances, 2, label);
        }
        t.is(stopped[context], 'offline', label);
        t.is(stopped[companion], 'live', label);
        t.deepEqual(stopped.stopped, [], label);
        t.is(stopped.highlighterRecordingStops, 0, label);
        t.is(stopped.highlighterReplayStops, 0, label);
        t.deepEqual(stopped.updatingDisplays, [], label);
        t.deepEqual(stopped.outputErrors, [], label);

        // Active highlighter recording/replay still owns the horizontal wrapper.
        // Otherwise only the display that lost its last target can be destroyed.
        const retained = highlighter && context === 'horizontal';
        t.is(stopped.outputRetained, retained, label);
        t.deepEqual(stopped.destroyed, retained ? [] : [`${context}/streaming`], label);
        t.is(stopped.numInstances, retained ? 2 : 1, label);
        t.is(stopped.recording, highlighter ? 'recording' : 'offline', label);
      }
    }
  }
});

test('Stopping a reconnecting inactive output completes without another deactivate', async t => {
  const { snapshots, error } = await runScenario(t, {
    setup: 'dual',
    context: 'horizontal',
    stages: [
      ['reconnect', 'deactivate'],
      ['stopping', 'stop'],
    ],
  });
  t.falsy(error);
  const [retrying, stopped] = snapshots;
  t.deepEqual(retrying.stopped, []);
  t.is(retrying.horizontal, 'reconnecting');
  t.is(stopped.horizontal, 'offline');
  t.deepEqual(stopped.stopped, ['vertical']);
  t.true(stopped.destroyed.includes('horizontal/streaming'));
  t.is(stopped.streamEndEvents, 1);
  t.deepEqual(stopped.outputErrors, []);
});

test('Failed terminal Stop reports its error once and still cleans up after deactivate', async t => {
  // The real signal handler intentionally logs this injected nonzero output error.
  skipCheckingErrorsInLog();
  const { snapshots, error } = await runScenario(t, {
    setup: 'dual',
    context: 'horizontal',
    stages: [
      [{ signal: 'stop', code: -5, error: 'Injected terminal disconnection' }],
      ['deactivate'],
    ],
  });
  t.falsy(error);
  const [pending, stopped] = snapshots;
  t.deepEqual(pending.outputErrors, ['stop: Injected terminal disconnection']);
  t.deepEqual(pending.stopped, []);
  t.deepEqual(pending.destroyed, []);
  t.is(stopped.horizontal, 'offline');
  t.deepEqual(stopped.stopped, ['vertical']);
  t.true(stopped.destroyed.includes('horizontal/streaming'));
  t.deepEqual(stopped.outputErrors, ['stop: Injected terminal disconnection']);
});

test('Retained Dual Output restart rejects Go Live when startup fails before Starting', async t => {
  skipCheckingErrorsInLog(); // The real error router logs the injected startup failure.
  const { snapshots, error } = await runScenario(t, {
    setup: 'dual',
    context: 'horizontal',
    stages: [['stop', 'deactivate']],
    retainedRestart: {
      startupSignals: [{ signal: 'stop', code: -1, error: 'Injected retained startup failure' }],
      stages: [],
    },
  });
  t.falsy(error);
  const [retained, failed] = snapshots;
  t.true(retained.outputRetained, 'ongoing recording retains the stopped streaming wrapper');
  t.is(retained.recording, 'recording');
  t.is(failed.nativeStarts, 1, 'the real validation path starts the retained instance');
  t.true(failed.goLiveRejected, 'the real output-error handler rejects the Go Live promise');
  t.deepEqual(failed.outputErrors, ['stop: Injected retained startup failure']);
  t.true(failed.stopped.includes('vertical'), 'the second attempt stops its running companion');
  t.is(failed.horizontal, 'offline');
  t.is(failed.recording, 'offline');
  t.true(failed.destroyed.includes('horizontal/recording'));
  t.false(failed.outputRetained);
});

test('Delayed retained restart observes Activate before Starting and waits for Deactivate', async t => {
  const { snapshots, error } = await runScenario(t, {
    setup: 'dual',
    context: 'horizontal',
    stages: [['stop', 'deactivate']],
    retainedRestart: {
      startupSignals: ['activate', 'starting'],
      stages: [['stop'], ['deactivate']],
    },
  });
  t.falsy(error);
  const [retained, restarted, pending, stopped] = snapshots;
  t.true(retained.outputRetained);
  t.is(restarted.nativeStarts, 1);
  t.is(restarted.horizontal, 'starting');
  t.deepEqual(restarted.stopped, []);
  t.deepEqual(pending.stopped, [], 'active capture prevents premature companion cleanup');
  t.deepEqual(pending.destroyed, []);
  t.deepEqual(stopped.stopped, ['vertical']);
  t.true(stopped.outputRetained, 'recording still retains the wrapper after the second stop');
  t.is(stopped.recording, 'recording');
  t.deepEqual(stopped.outputErrors, []);
});

test('Queued callbacks from the same streaming instance cannot affect its replacement handler', async t => {
  const { snapshots, error } = await runScenario(t, {
    setup: 'dual',
    context: 'horizontal',
    replaceHandlerWithQueuedSignals: true,
    stages: [['starting'], ['stop'], ['deactivate']],
  });
  t.falsy(error);
  const [restarted, pending, stopped] = snapshots;
  t.true(restarted.outputRetained);
  t.is(restarted.horizontal, 'starting');
  t.deepEqual(restarted.stopped, []);
  t.deepEqual(restarted.destroyed, []);
  t.deepEqual(pending.stopped, [], 'old deactivation must not clear new capture activity');
  t.deepEqual(pending.destroyed, []);
  t.deepEqual(stopped.stopped, ['vertical']);
  t.false(stopped.outputRetained);
  t.deepEqual(stopped.outputErrors, []);
});

async function runScenario(t: TExecutionContext, scenario: IScenario): Promise<IScenarioResult> {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    // Use the loaded worker implementation without mutating its singleton, creating native
    // outputs, reserving provider accounts, or depending on an external streaming endpoint.
    // This callback must remain synchronous: its promise chain uses the handler's compiled
    // implementation, without injecting a callback that depends on TypeScript's __awaiter.
    return (await t.context.app.client.executeAsync((input: IScenario, done) => {
      const singleton = (window as any).servicesManager.getResource('StreamingService');
      const prototype = Object.getPrototypeOf(singleton);
      const stopped: string[] = [];
      const destroyed: string[] = [];
      const published: string[] = [];
      const outputErrors: string[] = [];
      let highlighterRecordingStops = 0;
      let highlighterReplayStops = 0;
      let streamEndEvents = 0;
      let nativeStarts = 0;
      let goLiveRejected = false;
      let rejectGoLive: () => void = (): void => undefined;
      // This mirrors finishStartStreaming's pending promise; the real error handler
      // must invoke its rejection callback when the retained native start fails.
      new Promise<void>((_resolve, reject) => {
        rejectGoLive = reject;
      }).catch(() => {
        goLiveRejected = true;
      });
      const enhanced = input.setup === 'enhancedBroadcasting';
      const createOutput = (context: string) => ({
        useAdvanced: false,
        stop: () => stopped.push(context),
      });
      const createContext = (streaming: unknown = null) => ({
        streaming,
        recording: null as unknown,
        replayBuffer: null as unknown,
      });
      const createStatus = (streaming: string) => ({
        streaming,
        recording: 'offline',
        replayBuffer: 'offline',
      });
      const contexts = {
        horizontal: createContext(enhanced ? null : createOutput('horizontal')),
        vertical: createContext(input.setup === 'dual' ? createOutput('vertical') : null),
        enhancedBroadcasting: createContext(
          enhanced ? { ...createOutput('enhancedBroadcasting'), additionalVideo: {} } : null,
        ),
        stream: createContext(),
        streamSecond: createContext(),
      };
      const fixture: any = {
        contexts,
        state: {
          enhancedBroadcasting: enhanced,
          status: {
            horizontal: createStatus('live'),
            vertical: createStatus(input.setup === 'single' ? 'offline' : 'live'),
          },
        },
        views: {
          isDualOutputMode: input.setup !== 'single',
          isTwitchDualStreaming: enhanced,
          isTwitchDualStreamEnabled: enhanced,
          isLiveOutputEditingEnabled: !!input.liveOutputEditing,
        },
        incrementalRolloutService: {
          views: {
            featureIsEnabled: (feature: string) =>
              feature === 'slobs--live-output-editing' && !!input.liveOutputEditing,
          },
        },
        isUpdatingHorizontalStream: input.updatingDisplay === 'horizontal',
        isUpdatingVerticalStream: input.updatingDisplay === 'vertical',
        numInstances: input.setup === 'dual' ? 2 : 1,
        outputSettingsService: {
          getSettings: () => ({ mode: 'Simple' }),
          getStreamingSettings: () => ({ enableTwitchVOD: false }),
        },
        configureStreamingService: (): void => undefined,
        highlighterService: { shouldStartHighlighterOutputs: !!input.highlighter },
        streamingStatusChange: { next: (status: string) => published.push(status) },
        SET_STREAMING_STATUS(status: string, context: 'horizontal' | 'vertical') {
          fixture.state.status[context].streaming = status;
        },
        displayNeedsNonEnhancedBroadcastingInstance: () => !enhanced,
        handleEnhancedBroadcastingResolutionChangeSignal: () => false,
        sendReconnectingNotification: (): void => undefined,
        clearReconnectingNotification: (): void => undefined,
        sendStreamEndEvent: () => streamEndEvents++,
        toggleRecording() {
          highlighterRecordingStops++;
          fixture.state.status.horizontal.recording = 'offline';
          return Promise.resolve();
        },
        stopReplayBuffer() {
          highlighterReplayStops++;
          fixture.state.status.horizontal.replayBuffer = 'offline';
        },
        destroyOutputContextIfExists(
          context: keyof typeof contexts,
          type: 'streaming' | 'recording' | 'replayBuffer',
        ) {
          if (contexts[context][type]) {
            destroyed.push(`${context}/${type}`);
            contexts[context][type] = null;
            if (context === 'horizontal' || context === 'vertical') {
              fixture.state.status[context][type] = 'offline';
            }
          }
          return Promise.resolve();
        },
        handleFactoryOutputError(info: { signal: string; error: string }) {
          outputErrors.push(`${info.signal}: ${info.error}`);
          return Promise.resolve();
        },
        createOBSError(
          _type: string,
          _context: string,
          signal: string,
          _code: number,
          error: string,
        ) {
          outputErrors.push(`${signal}: ${error}`);
        },
        resetInfo: () => Promise.resolve(),
        RESET_STREAM_INFO: (): void => undefined,
        rejectStartStreaming: () => rejectGoLive(),
      };
      Object.setPrototypeOf(fixture, prototype);
      if (input.highlighter) {
        fixture.state.status.horizontal.recording = 'recording';
        fixture.state.status.horizontal.replayBuffer = 'running';
      }
      if (input.retainedRestart) {
        fixture.state.status.horizontal.recording = 'recording';
        contexts.horizontal.recording = {};
        // Keep the real failure routing for retained restarts, including companion
        // cleanup and Go Live rejection. Only reporting and native release are fake.
        delete fixture.handleFactoryOutputError;
      }

      const snapshots: ISnapshot[] = [];
      const originalOutput = contexts[input.context].streaming;
      const snapshot = () => ({
        horizontal: fixture.state.status.horizontal.streaming,
        vertical: fixture.state.status.vertical.streaming,
        stopped: stopped.slice(),
        destroyed: destroyed.slice(),
        published: published.slice(),
        highlighterRecordingStops,
        highlighterReplayStops,
        streamEndEvents,
        outputErrors: outputErrors.slice(),
        recording: fixture.state.status.horizontal.recording,
        outputRetained: contexts[input.context].streaming === originalOutput,
        nativeStarts,
        goLiveRejected,
        updatingDisplays: [
          ...(fixture.isUpdatingHorizontalStream ? ['horizontal'] : []),
          ...(fixture.isUpdatingVerticalStream ? ['vertical'] : []),
        ],
        numInstances: fixture.numInstances,
      });

      try {
        fixture.configureStreamingSignals(input.context);
        const output = fixture.contexts[input.context].streaming;
        // Establish real capture activity through the callback before testing a
        // disconnect. Activate does not rerun Desktop's Go Live startup workflow.
        let activated = output.signalHandler({
          type: 'streaming',
          signal: 'activate',
          code: 0,
          error: '',
        }) as Promise<void>;
        const emit = (signal: string | IScenarioSignal) =>
          output.signalHandler(
            typeof signal === 'string'
              ? { type: 'streaming', signal, code: 0, error: '' }
              : { type: 'streaming', ...signal },
          ) as Promise<void>;
        if (input.replaceHandlerWithQueuedSignals) {
          activated = activated.then(() => {
            const oldHandler = output.signalHandler;
            const obsoleteSignals = Promise.all([
              oldHandler({ type: 'streaming', signal: 'stop', code: 0, error: '' }),
              oldHandler({ type: 'streaming', signal: 'deactivate', code: 0, error: '' }),
            ]);
            // Replace synchronously before either old queued callback executes.
            fixture.configureStreamingSignals(input.context);
            return Promise.all([obsoleteSignals, emit('activate')]).then((): void => undefined);
          });
        }
        const deliverStages = (stages: IScenario['stages'], ready = Promise.resolve()) =>
          stages.reduce(
            (chain, signals) =>
              chain.then(() =>
                // Queue each stage together to exercise the actual per-instance serialization.
                Promise.all(signals.map(emit)).then(() => {
                  snapshots.push(snapshot());
                }),
              ),
            ready,
          );
        deliverStages(input.stages, activated)
          .then(() => {
            if (!input.retainedRestart) return;
            if (contexts.horizontal.streaming !== output) {
              throw new Error('The first stop did not retain the horizontal streaming wrapper');
            }
            // A second Go Live has already started a fresh vertical companion when
            // the real Dual Output handler reaches horizontal instance validation.
            contexts.vertical.streaming = createOutput('vertical');
            fixture.state.status.vertical.streaming = 'starting';
            stopped.length = 0;
            destroyed.length = 0;
            published.length = 0;
            outputErrors.length = 0;
            let startSignals = Promise.resolve();
            output.start = () => {
              nativeStarts++;
              startSignals = Promise.all(input.retainedRestart.startupSignals.map(emit)).then(
                (): void => undefined,
              );
            };
            return fixture
              .validateOrCreateOutputInstance({
                display: 'horizontal',
                context: 'horizontal',
                type: 'streaming',
                start: true,
              })
              .then(() => startSignals)
              .then(() => {
                snapshots.push(snapshot());
                return deliverStages(input.retainedRestart.stages);
              });
          })
          .then(() => done({ snapshots }))
          .catch((error: Error) => done({ snapshots, error: error.message }));
      } catch (error: unknown) {
        done({ snapshots, error: error instanceof Error ? error.message : String(error) });
      }
    }, scenario)) as IScenarioResult;
  } finally {
    await focusMain();
  }
}
