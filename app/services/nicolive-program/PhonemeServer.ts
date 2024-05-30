import { createServer } from 'http';
import { Server } from 'socket.io';

export class PhonemeServer {
  io: Server;

  constructor({ onPortAssigned }: { onPortAssigned: (port: number) => void }) {
    try {
      const server = createServer();
      server.listen(() => {
        const address = server.address();
        if (typeof address === 'object') {
          console.log('PhonemeServer: socket.io listening on', address.port);
          onPortAssigned(address.port);
        }
      });
      this.io = new Server(server, {
        transports: ['polling'],
        cors: {
          origin: '*',
        },
      });
    } catch (e) {
      console.error('socket.io constructor error', e);
    }
  }

  emitPhoneme(phoneme: string) {
    if (!this.io) return;
    this.io.emit('phoneme', phoneme);
  }
}
