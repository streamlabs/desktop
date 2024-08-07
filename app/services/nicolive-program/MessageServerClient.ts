import { Observable } from 'rxjs';
import { MessageResponse } from './ChatMessage';

export type MessageServerConfig = {
  viewUri: string;
};

export interface IMessageServerClient {
  connect(): Observable<MessageResponse>;
  close(): void;
}
