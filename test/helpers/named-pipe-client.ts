import * as net from 'net';

export class NamedPipeClient {
  private socket: any;

  connect(port?: number, host?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      if (port !== undefined) {
        this.socket.connect(port, host, resolve);
      }
      this.socket.on('error', () => reject(new Error('Failed to connect to the named pipe')));
    });
  }

  write(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.write(data, (err: any) =>
        err ? reject(new Error('Failed to write to the named pipe')) : resolve(),
      );
    });
  }

  read_until(delimiter: string): Promise<Buffer[]> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.socket.on('data', (data: Buffer) => {
        chunks.push(data);
        if (data.toString().includes(delimiter)) resolve(chunks);
      });
      this.socket.on('error', () => reject(new Error('Failed to read from the named pipe')));
    });
  }

  close() {
    this.socket.destroy();
  }
}
