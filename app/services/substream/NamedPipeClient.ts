import * as net from 'net';

//    const PIPE_NAME = '\\\\.\\pipe\\NAirSubstream';

class NamedPipeClient {
  name = '';
  client: net.Socket = undefined;
  lastPromise: Promise<any> = Promise.resolve();

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
    });
  }

  async call(arg: any): Promise<any> {
    await this.open();

    this.lastPromise = this.lastPromise.then(() => {
      return new Promise((resolve, reject) => {
        const onData = (data: Buffer) => {
          resolve(JSON.parse(data.toString()));
          this.client.off('data', onData);
        };

        setTimeout(() => {
          this.client.off('data', onData);
          reject(new Error('Request timed out'));
        }, 1000);

        this.client.once('data', onData);
        this.client.write(JSON.stringify(arg));
      });
    });

    return this.lastPromise;
  }
}
