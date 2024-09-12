import * as Sentry from '@sentry/vue';
import { ChildProcess, spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import { createInterface } from 'readline';

export function getNVoicePath(): string {
  // import/require構文を使うとビルド時に展開してしまうが、
  // バイナリファイルを実行時に参照するために実行時のrequireでロードする必要がある
  const nVoicePath = window['require']('@n-air-app/n-voice-package')
    .getNVoicePath()
    .replace('app.asar', 'app.asar.unpacked'); // ビルドしたpackageでは展開パスは置換する必要がある
  return nVoicePath;
}

class CallbackReceiver {
  private received: string[] = [];
  private callback?: (data: string) => boolean;
  private callbackWaitings: ((data: string) => boolean)[] = [];

  flush(log: ((line: string) => void) | undefined = undefined): void {
    while (this.received.length > 0) {
      if (this.callback === undefined) {
        this.callback = this.callbackWaitings.shift();
        if (this.callback === undefined) {
          break;
        }
      }
      const line = this.received.shift();
      if (line === undefined) {
        break;
      }
      if (log !== undefined) {
        log(line);
      }
      if (this.callback(line)) {
        this.callback = undefined;
      }
    }
  }

  receive(line: string): void {
    this.received.push(line);
  }

  /**
   * callbackが trueを返すまで、次の行を受信する
   */
  waitLine(callback: (data: string) => boolean): void {
    this.callbackWaitings.push(callback);
    this.flush();
  }
}

class CommandLineClient {
  private receiver: CallbackReceiver = new CallbackReceiver();
  private stdout: NodeJS.ReadableStream;
  private stderr: NodeJS.ReadableStream;

  private terminateResolve: (value: number | PromiseLike<number>) => void;
  private terminateReject: (reason?: unknown) => void;
  private terminated: Promise<number>;

  private terminateCallbacks: (() => void)[] = [];

  constructor(
    private subprocess: ChildProcess,
    private log: (...args: unknown[]) => void,
    private showStdout: boolean,
  ) {
    this.stdout = this.subprocess.stdout;
    this.stderr = this.subprocess.stderr;

    this.terminateResolve = () => {
      /* do nothing */
    };
    this.terminateReject = () => {
      /* do nothing */
    };
    this.terminated = new Promise<number>((resolve, reject) => {
      this.terminateResolve = resolve;
      this.terminateReject = reject;
    }).finally(() => {
      this.terminateCallbacks.forEach(callback => callback());
    });
  }

  /**
   * register callback to be called on terminated
   * @returns cancel function
   */
  onTerminate(callback: () => void): () => void {
    this.terminateCallbacks.push(callback);
    return () => {
      this.terminateCallbacks = this.terminateCallbacks.filter(c => c !== callback);
    };
  }

  get pid() {
    return this.subprocess.pid;
  }
  get exitCode() {
    return this.subprocess.exitCode;
  }
  waitExit(): Promise<number> {
    return this.terminated;
  }

  kill(): void {
    this.subprocess.kill();
  }

  async run(label: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const rl = createInterface({
        input: this.stdout,
        terminal: false,
        prompt: '',
      });
      const rlErr = createInterface({
        input: this.stderr,
        terminal: false,
        prompt: '',
      });

      const onLine = (line: string) => {
        if (this.showStdout) {
          this.log(`${label} -> ${line}`);
        }
        this.receiver.receive(line);
        this.flush();
      };
      rl.on('line', onLine);

      this.subprocess.on('error', err => {
        console.log('subprocess.error', err);
        reject(err);
        this.terminateReject(err);
      });
      this.subprocess.on('close', code => {
        this.log(`${label} terminated: ${code}`);
        this.terminateResolve(code || -1);
      });
      // node 15未満は spawn event がないので起動成功したことにする
      resolve();
    });
  }

  async send(line: string): Promise<void> {
    await new Promise(resolve => {
      this.log(`<- ${line}`);
      this.subprocess.stdin.write(line + '\n', resolve);
    });
  }

  private flush(): void {
    this.receiver.flush((line: string) => this.log(`-> ${line}`));
  }

  /**
   * callbackが trueを返すまで、次の行を受信する
   */
  waitLine(callback: (data: string) => boolean): void {
    this.receiver.waitLine(callback);
  }
}

// API document https://github.com/n-air-app/n-voice-package/tree/main/n-voice/doc

async function StartNVoice(
  enginePath: string,
  dictionaryPath: string,
  userDictionary: string,
  modelPath: string,
  extraVoicesPath: string,
  cwd: string,
): Promise<CommandLineClient> {
  const log = (...args: unknown[]) => {
    console.log(...args);
  };

  const client = new CommandLineClient(
    spawn(enginePath, [dictionaryPath, userDictionary, modelPath, extraVoicesPath], {
      stdio: 'pipe',
      cwd,
    }),
    log,
    true, // options.showStdout,
  );
  await client.run(basename(enginePath));
  return client;
}

const iconv = require('iconv-lite');
function toShiftJisBase64(text: string): string {
  return Buffer.from(iconv.encode(text, 'Shift_JIS')).toString('base64');
}

type Command =
  | 'quit'
  | 'protocol_version'
  | 'name'
  | 'version'
  | 'list_commands'
  | 'talk'
  | 'annotated_talk'
  | 'max_time'
  | 'set_max_time'
  | 'test';

const ErrorCodes: { [code: number]: string } = {
  1: 'invalid argument',
  2: 'model not found',
  101: 'command io error',
  102: 'command not found',
  201: 'file io error',
  301: 'could not read text',
  302: 'could not read path',
  401: 'could not parse text',
};

export type Label = {
  start: number;
  end: number;
  phoneme: string;
};

function loadLabelFile(filename: string): Label[] {
  const labels = readFileSync(filename, 'utf8');
  const lines = labels.split(/\r?\n/).filter(line => line.length > 0);
  const result: Label[] = [];
  for (const line of lines) {
    const [start, end, phoneme] = line.split('\t');
    result.push({
      start: parseFloat(start),
      end: parseFloat(end),
      phoneme,
    });
  }
  return result;
}

class NVoiceEngineError extends Error {
  constructor(public code: string) {
    // @ts-expect-error ts7015 code は数字の文字列
    const title = ErrorCodes[code];
    super(`${code}: ${title}`);

    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const supportedProtocolVersion = '1.0.0';
export class NVoiceClient {
  private commandLineClient: CommandLineClient | undefined;

  constructor(
    readonly options: {
      baseDir: string;
      onError: (err: Error) => void;
    },
  ) {
    console.log(`NVoiceClient: baseDir: ${this.options.baseDir}`);
  }

  async startNVoice(): Promise<void> {
    if (this.commandLineClient === undefined) {
      await this._startNVoice();
    }
  }

  async _startNVoice(): Promise<void> {
    try {
      const baseDir = this.options.baseDir;
      const enginePath = join(baseDir, 'n-voice-engine.exe');
      const dictionaryPath = 'open_jtalk_dic_shift_jis-1.11';
      const userDictionary = 'user.dic';

      const models = readdirSync(baseDir).filter(s => /.*\.pt$/.test(s));
      if (models.length !== 1) {
        throw new Error('model file found: ' + models.join(', '));
      }
      const cwd = baseDir;
      const extraVoicesPath = 'n-voice_extra-voices';
      const client = await StartNVoice(
        enginePath,
        dictionaryPath,
        userDictionary,
        models[0],
        extraVoicesPath,
        cwd,
      );
      let started = false;
      client.waitExit().then(code => {
        if (!started) {
          this.options.onError(new Error(`n-voice-engine start failed! ${code}`));
        }
        this.commandLineClient = undefined; // 落ちたときは次回、起動を試みる
      });
      this.commandLineClient = client;
      const r = await this.waitOkNg(client);
      const protocolVersion = await this.protocol_version();
      if (protocolVersion !== supportedProtocolVersion) {
        throw new Error(`unexpected protocol version: ${protocolVersion}`);
      }
      started = true;
    } catch (err) {
      console.error(err);
      this.options.onError(err as Error);
      // throw err;
    }
  }

  // ok か ng が来るまで待って、来たらその後の文字列を返す
  waitOkNg(client: CommandLineClient): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // waitOkNg中に engineが落ちたら、rejectする
      const cancelWatchingTerminate = client.onTerminate(() => {
        reject(new Error(`n-voice-engine exited: ${client.exitCode}`));
      });
      client.waitLine((data: string) => {
        const [first, ...rest] = data.split(' ');
        switch (first) {
          case 'ok':
            cancelWatchingTerminate();
            resolve(rest);
            return true;

          case 'ng': {
            const code = rest[0];
            cancelWatchingTerminate();
            reject(new NVoiceEngineError(code));
            return true;
          }

          default:
            return false;
        }
      });
    });
  }

  async _command(
    command: Command,
    ...args: {
      label: string;
      value: string;
      encoder?: (value: string) => string;
      sentryExtra?: boolean;
    }[]
  ): Promise<string[]> {
    await this.startNVoice();
    try {
      Sentry.addBreadcrumb({
        category: 'n-voice-engine',
        message: `${command} ${args.map(a => a.value).join(' ')}`,
      });
      await this.commandLineClient.send(
        [
          command,
          ...args.map(a => {
            if (a.encoder) {
              return a.encoder(a.value);
            } else {
              return a.value;
            }
          }),
        ].join(' '),
      );
      return await this.waitOkNg(this.commandLineClient);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setLevel('error');
        if (err instanceof NVoiceEngineError) {
          scope.setTag('NVoiceEngineError.code', err.code);
          for (const a of args) {
            if (a.sentryExtra) {
              scope.setExtra(a.label, a.value);
            } else {
              scope.setTag(`${command}.${a.label}`, a.value);
            }
          }
          switch (err.code) {
            case '401': // テキスト解析失敗
              scope.setLevel('warning');
              break;
          }
          scope.setFingerprint([command, 'NVoiceEngineError', err.code]);
        } else {
          scope.setFingerprint([command]);
        }
        Sentry.captureException(err);
        throw err;
      });
    }
  }

  async protocol_version(): Promise<string> {
    const r = await this._command('protocol_version');
    return r[0];
  }

  async talk(
    speed: number,
    text: string,
    filename: string,
  ): Promise<{ wave: Buffer | null; labels: Label[] }> {
    if (text === '') {
      // ignore empty text
      return { wave: null, labels: [] };
    }
    try {
      await this._command(
        'talk',
        {
          label: 'speed',
          value: speed.toString(),
        },
        {
          label: 'text',
          value: text,
          encoder: toShiftJisBase64,
        },
        {
          label: 'filename',
          value: filename,
          encoder: toShiftJisBase64,
          sentryExtra: true,
        },
      );
    } catch (err) {
      // TODO エラー内容によってはユーザーに伝えるか?
      return { wave: null, labels: [] };
    }

    const wave = existsSync(filename) ? readFileSync(filename) : null;
    if (wave) {
      unlinkSync(filename);
    }
    const labelFilename = filename + '.txt';
    let labels: Label[] = [];
    if (existsSync(labelFilename)) {
      labels = loadLabelFile(labelFilename);
      unlinkSync(labelFilename);
    }
    return { wave, labels };
  }

  async set_max_time(seconds: number): Promise<void> {
    await this._command('set_max_time', {
      label: 'seconds',
      value: seconds.toString(),
    });
  }

  loaded(): boolean {
    return this.commandLineClient !== undefined;
  }
}
