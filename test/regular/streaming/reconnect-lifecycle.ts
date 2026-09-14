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
      const enhanced = input.setup === 'enhancedBroadcasting';
      const createOutput = (context: string) => ({
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
        },
        numInstances: input.setup === 'dual' ? 2 : 1,
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
        destroyOutputContextIfExists(context: keyof typeof contexts, type: 'streaming') {
          if (contexts[context][type]) {
            destroyed.push(`${context}/${type}`);
            contexts[context][type] = null;
          }
          return Promise.resolve();
        },
        handleFactoryOutputError(info: { signal: string; error: string }) {
          outputErrors.push(`${info.signal}: ${info.error}`);
          return Promise.resolve();
        },
        RESET_STREAM_INFO: (): void => undefined,
        rejectStartStreaming: (): void => undefined,
      };
      Object.setPrototypeOf(fixture, prototype);
      if (input.highlighter) {
        fixture.state.status.horizontal.recording = 'recording';
        fixture.state.status.horizontal.replayBuffer = 'running';
      }

      const snapshots: ISnapshot[] = [];
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
      });

      try {
        fixture.configureStreamingSignals(input.context);
        const output = fixture.contexts[input.context].streaming;
        // Establish real capture activity through the callback before testing a
        // disconnect. Activate does not rerun Desktop's Go Live startup workflow.
        const activated = output.signalHandler({
          type: 'streaming',
          signal: 'activate',
          code: 0,
          error: '',
        }) as Promise<void>;
        input.stages
          .reduce(
            (chain, signals) =>
              chain.then(() =>
                // Queue each stage together to exercise the actual per-instance serialization.
                Promise.all(
                  signals.map(signal =>
                    output.signalHandler(
                      typeof signal === 'string'
                        ? { type: 'streaming', signal, code: 0, error: '' }
                        : { type: 'streaming', ...signal },
                    ),
                  ),
                ).then(() => {
                  snapshots.push(snapshot());
                }),
              ),
            activated,
          )
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
