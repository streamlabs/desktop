export type TShutdownStepCriticality = 'required' | 'best-effort';

export interface IShutdownStep {
  name: string;
  criticality: TShutdownStepCriticality;
  run: (signal?: AbortSignal) => Promise<unknown> | unknown;
  timeoutMs?: number;
}

export interface IShutdownFailure {
  name: string;
  criticality: TShutdownStepCriticality;
  error: unknown;
}

export interface IShutdownReport {
  clean: boolean;
  failures: IShutdownFailure[];
}

export interface IShutdownLogger {
  log(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

export interface IShutdownRunnerOptions {
  logger?: IShutdownLogger;
  setTimeoutFn?: (callback: () => void, delay: number) => unknown;
  clearTimeoutFn?: (timer: unknown) => void;
}

export interface IWorkerShutdownPlan {
  persistence: IShutdownStep[];
  teardown: IShutdownStep[];
  bestEffort: IShutdownStep[];
}

export interface IWorkerShutdownOptions extends IShutdownRunnerOptions {
  initialReport?: IShutdownReport;
  markClean: () => Promise<unknown> | unknown;
  onComplete: (report: IShutdownReport) => void;
}

const defaultLogger: IShutdownLogger = {
  log(message: string) {
    console.log(message);
  },
  error(message: string, error?: unknown) {
    console.error(message, error);
  },
};

function createReport(failures: IShutdownFailure[] = []): IShutdownReport {
  return {
    failures,
    clean: !failures.some(failure => failure.criticality === 'required'),
  };
}

export function mergeShutdownReports(...reports: IShutdownReport[]): IShutdownReport {
  return createReport(
    reports.reduce<IShutdownFailure[]>((all, report) => {
      all.push(...report.failures);
      return all;
    }, []),
  );
}

function writeLog(
  logger: IShutdownLogger,
  level: 'log' | 'error',
  message: string,
  error?: unknown,
) {
  try {
    logger[level](message, error);
  } catch (e: unknown) {
    // Logging must never interrupt application teardown.
  }
}

function executeStepWithTimeout(
  step: IShutdownStep,
  options: IShutdownRunnerOptions,
): Promise<unknown> {
  const abortController = step.timeoutMs && step.timeoutMs > 0 ? new AbortController() : undefined;
  let stepPromise: Promise<unknown>;

  try {
    stepPromise = Promise.resolve(step.run(abortController?.signal));
  } catch (error: unknown) {
    stepPromise = Promise.reject(error);
  }

  if (!step.timeoutMs || step.timeoutMs <= 0) return stepPromise;

  const setTimeoutFn = options.setTimeoutFn || ((callback, delay) => setTimeout(callback, delay));
  const clearTimeoutFn =
    options.clearTimeoutFn ||
    ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      abortController?.abort();
      reject(new Error(`${step.name} timed out after ${step.timeoutMs}ms`));
    }, step.timeoutMs!);

    stepPromise.then(
      value => {
        if (settled) return;
        settled = true;
        clearTimeoutFn(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeoutFn(timer);
        reject(error);
      },
    );
  });
}

export async function executeShutdownSteps(
  steps: IShutdownStep[],
  options: IShutdownRunnerOptions = {},
): Promise<IShutdownReport> {
  const logger = options.logger || defaultLogger;
  const failures: IShutdownFailure[] = [];

  for (const step of steps) {
    writeLog(logger, 'log', `[Shutdown] Starting ${step.name}`);

    try {
      await executeStepWithTimeout(step, options);
      writeLog(logger, 'log', `[Shutdown] Completed ${step.name}`);
    } catch (error: unknown) {
      failures.push({ name: step.name, criticality: step.criticality, error });
      writeLog(logger, 'error', `[Shutdown] Failed ${step.name}`, error);
    }
  }

  return createReport(failures);
}

/**
 * Executes synchronous ingress shutdown without yielding to the renderer event loop.
 */
export function executeImmediateShutdownSteps(
  steps: IShutdownStep[],
  options: IShutdownRunnerOptions = {},
): IShutdownReport {
  const logger = options.logger || defaultLogger;
  const failures: IShutdownFailure[] = [];

  for (const step of steps) {
    writeLog(logger, 'log', `[Shutdown] Starting ${step.name}`);

    try {
      const result = step.run();
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        // The step is invalid, but still observe its eventual rejection so an accidental async
        // ingress implementation cannot surface as an unhandled rejection during shutdown.
        void Promise.resolve(result).catch(() => undefined);
        throw new Error(`${step.name} must be synchronous when used as an immediate shutdown step`);
      }
      writeLog(logger, 'log', `[Shutdown] Completed ${step.name}`);
    } catch (error: unknown) {
      failures.push({ name: step.name, criticality: step.criticality, error });
      writeLog(logger, 'error', `[Shutdown] Failed ${step.name}`, error);
    }
  }

  return createReport(failures);
}

/**
 * Runs shutdown in ordered phases. Local persistence always settles before destructive teardown,
 * and best-effort work only starts after teardown has been attempted.
 */
export async function runWorkerShutdown(
  plan: IWorkerShutdownPlan,
  options: IWorkerShutdownOptions,
): Promise<IShutdownReport> {
  const runnerOptions: IShutdownRunnerOptions = options;
  let report = options.initialReport || createReport();

  try {
    for (const steps of [plan.persistence, plan.teardown, plan.bestEffort]) {
      report = mergeShutdownReports(report, await executeShutdownSteps(steps, runnerOptions));
    }

    if (report.clean) {
      report = mergeShutdownReports(
        report,
        await executeShutdownSteps(
          [
            {
              name: 'CrashReporterService.endShutdown',
              criticality: 'required',
              run: options.markClean,
            },
          ],
          runnerOptions,
        ),
      );
    }
  } catch (error: unknown) {
    report = mergeShutdownReports(
      report,
      createReport([
        {
          name: 'WorkerShutdown.unexpectedFailure',
          criticality: 'required',
          error,
        },
      ]),
    );
    writeLog(
      options.logger || defaultLogger,
      'error',
      '[Shutdown] Unexpected shutdown failure',
      error,
    );
  } finally {
    options.onComplete(report);
  }

  return report;
}
