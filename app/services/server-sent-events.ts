import { Service } from './core/service';
import { Subject, Observable } from 'rxjs';

export class SseService extends Service {
  private eventSources = new Map<string, EventSource>();
  private subjects = new Map<string, Subject<MessageEvent>>();

  public open(url: string = 'http://localhost:8000/events'): Observable<MessageEvent> {
    // if we already have a connection for this URL, return its observable
    if (this.subjects.has(url)) {
      return this.subjects.get(url)!.asObservable();
    }

    // Otherwise, create a new Subject + EventSource
    const subject = new Subject<MessageEvent>();
    const eventSource = new EventSource(url);

    eventSource.onmessage = (e: MessageEvent) => {
      console.log(`SSE message from ${url}`, e.data);
      subject.next(e);
    };
    eventSource.onerror = (err: any) => {
      console.error(`SSE error on ${url}`, err);
      subject.error(err);
    };

    this.eventSources.set(url, eventSource);
    this.subjects.set(url, subject);

    return subject.asObservable();
  }

  public close(url?: string) {
    if (url) {
      const eventSource = this.eventSources.get(url);
      const subject = this.subjects.get(url);
      if (eventSource) {
        eventSource.close();
        this.eventSources.delete(url);
      }
      if (subject) {
        subject.complete();
        this.subjects.delete(url);
      }
    } else {
      for (const [u, eventSource] of this.eventSources) {
        eventSource.close();
      }
      for (const subject of this.subjects.values()) {
        subject.complete();
      }
      this.eventSources.clear();
      this.subjects.clear();
    }
  }
}
