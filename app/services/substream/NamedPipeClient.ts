import * as net from 'net';

//    const PIPE_NAME = '\\\\.\\pipe\\NAirSubstream';

export class NamedPipeClient {
  name = '';
  client: net.Socket = undefined;
  lastPromise: Promise<any> = Promise.resolve();

  queue = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void; timeout: NodeJS.Timeout }
  >();

  constructor(name: string) {
    this.name = name;
  }

  private async open(): Promise<void> {
    if (this.client) return;

    return new Promise((resolve, reject) => {
      const client = net.createConnection(this.name, () => {
        this.client = client;
        resolve();
      });

      client.on('end', () => {});
      client.on('error', (err: Error) => {
        reject(err);
      });

      client.on('data', (data: Buffer) => {
        try {
          //          console.log('np-recv:', data.toString());
          const response = JSON.parse(data.toString());

          if (response.id) {
            const r = this.queue.get(response.id);
            if (r) {
              clearTimeout(r.timeout);
              this.queue.delete(response.id);
              const result = response.res ?? {};
              r.resolve(result);
            }
          } else {
            console.log('no id:', data.toString());
          }
        } catch (err) {
          console.error('Invalid response format:', data.toString());
        }
      });
    });
  }

  // {id, fn, arg} を送信
  // id は一意のリクエスト ID
  // fn は呼び出す関数名
  // arg は関数の引数
  // レスポンスは {id, res} の形式で返される
  // id はリクエスト ID
  // res は関数の戻り値

  async call(fn: string, arg: any): Promise<any> {
    await this.open();

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2, 10);

      const timeout = setTimeout(() => {
        this.queue.delete(id);
        reject(new Error('Request timed out'));
      }, 1000);

      this.queue.set(id, { resolve, reject, timeout });
      this.client.write(JSON.stringify({ id, fn, arg }));
      //      console.log('np-send:', JSON.stringify({ id, fn, arg }));
    });
  }
}
