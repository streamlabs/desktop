import { dwango, google } from '@n-air-app/nicolive-comment-protobuf';
import Long from 'long';
import { Reader } from 'protobufjs/minimal';
import { Subject } from 'rxjs';
import { FilterType } from './ResponseTypes';
import { NdgrFetchError } from './NdgrFetchError';
import { sleep } from 'util/sleep';
import * as Sentry from '@sentry/vue';

const BACKWARD_SEGMENT_INTERVAL = 7; // in ms

export function toNumber(num: Long | number): number {
  if (typeof num === 'number') {
    return num;
  }
  return num.toNumber();
}

export function toISO8601(timestamp: google.protobuf.ITimestamp): string {
  return new Date(toNumber(timestamp.seconds) * 1000).toISOString();
}

export function convertSSNGType(
  type: dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGType,
): FilterType {
  switch (type) {
    case dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGType.USER:
      return 'user';
    case dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGType.WORD:
      return 'word';
    case dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGType.COMMAND:
      return 'command';
    default:
      throw new Error(`Unknown SSNGType: ${type}`);
  }
}

export class NdgrClient {
  private isDisposed: boolean = false;
  public messages: Subject<dwango.nicolive.chat.service.edge.ChunkedMessage>;
  private options = { label: 'ndgr', maxRetry: 3, retryInterval: 1000 };

  /**
   * @param uri 接続するURI
   * @param options.label デバッグログ識別用ラベル
   * @param options.maxRetry fetch errorのリトライ回数
   * @param options.retryInterval fetch errorのリトライ間隔(ms)
   */
  constructor(
    private uri: string,
    options: { label?: string; maxRetry?: number; retryInterval?: number } | string = {},
  ) {
    if (typeof options === 'string') {
      this.options.label = options;
    } else {
      this.options = { ...this.options, ...options };
    }
    this.messages = new Subject();
  }

  public async connect(from_unix_time?: number | 'now', numBackward = 0): Promise<void> {
    let next: number | Long | string = from_unix_time ?? 'now';
    let initPhase = true;
    while (next && !this.isDisposed) {
      const fetchUri = `${this.uri}?at=${next}`;
      next = null;
      for await (const entry of this.retrieve(fetchUri, reader =>
        dwango.nicolive.chat.service.edge.ChunkedEntry.decodeDelimited(reader),
      )) {
        if (entry.backward != null) {
          if (initPhase && numBackward > 0) {
            const backwards = await this.pullBackwards(entry.backward.segment.uri, numBackward);
            for (const msg of backwards) {
              this.messages.next(new dwango.nicolive.chat.service.edge.ChunkedMessage(msg));
            }
          }
        } else if (entry.previous != null) {
          if (initPhase) {
            await this.retrieveMessages(entry.previous.uri);
          }
        } else if (entry.segment != null) {
          initPhase = false;
          await this.retrieveMessages(entry.segment.uri);
        } else if (entry.next != null) {
          next = entry.next.at;
        }
      }
    }
  }

  private async fetchWithHandling(uri: string): Promise<Response> {
    let response: Response;
    for (let retryRemain = this.options.maxRetry; retryRemain >= 0; retryRemain--) {
      try {
        response = await fetch(uri);
        break;
      } catch (error) {
        if (retryRemain === 0) {
          throw new NdgrFetchError(error as Error, uri, this.options.label);
        } else {
          Sentry.withScope(scope => {
            scope.setLevel('warning');
            scope.setTags({
              category: 'ndgr',
              uri,
              try: this.options.maxRetry - retryRemain,
              label: this.options.label,
            });
            scope.setFingerprint(['ndgr-fetch-error', this.options.label]);
            Sentry.captureMessage(`Failed to fetch(${uri}): ${error}`);
          });
        }
        await sleep(this.options.retryInterval);
      }
    }
    if (!response.ok) throw new NdgrFetchError(response.status, uri, this.options.label);
    return response;
  }

  private async pullBackwards(
    fetchUri: string,
    want: number,
  ): Promise<dwango.nicolive.chat.service.edge.IChunkedMessage[]> {
    if (want === 0) {
      return [];
    }
    const buf: dwango.nicolive.chat.service.edge.IChunkedMessage[][] = [];
    let length = 0;

    while (length < want) {
      const resp = await this.fetchWithHandling(fetchUri);
      const body = await resp.arrayBuffer();
      const packed = dwango.nicolive.chat.service.edge.PackedSegment.decode(new Uint8Array(body));
      buf.unshift(packed.messages);
      length += packed.messages.length;
      if (!packed.next) break;
      await sleep(BACKWARD_SEGMENT_INTERVAL);
      fetchUri = packed.next.uri;
    }
    const result = buf.flat();
    if (result.length > want) {
      return result.slice(result.length - want);
    }
    return result;
  }

  private async retrieveMessages(uri: string): Promise<void> {
    for await (const msg of this.retrieve(uri, reader =>
      dwango.nicolive.chat.service.edge.ChunkedMessage.decodeDelimited(reader),
    )) {
      if (this.isDisposed) return;
      this.messages.next(msg);
      if (msg.state != null) {
        this.updateState(msg);
      }
    }
  }

  private async *retrieve<T>(
    uri: string,
    decoder: (reader: Reader) => T,
  ): AsyncGenerator<T, void, undefined> {
    let unread = new Uint8Array();
    const response = await this.fetchWithHandling(uri);
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const buffer = Reader.create(new Uint8Array([...unread, ...value]));
      try {
        while (buffer.pos < buffer.len) {
          const msg = decoder(buffer);
          yield msg;
        }
        unread = new Uint8Array();
      } catch (error) {
        if (error instanceof RangeError) {
          //protobufが途中でちぎれていた場合RangeErrorになるので未読分をunreadにつめる
          unread = buffer.buf.slice(buffer.pos); // Save unread part
        } else {
          throw error;
        }
        break;
      }
    }
  }

  private updateState(msg: dwango.nicolive.chat.service.edge.ChunkedMessage): void {
    // 現在は不要だが、将来状態更新するときここに書く
  }

  public dispose(): void {
    this.isDisposed = true;
    this.messages.complete();
  }
}
