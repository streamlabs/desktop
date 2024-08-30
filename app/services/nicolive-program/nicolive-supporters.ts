import { StatefulService, mutation } from 'services/core';
import { NicoliveClient, isOk } from './NicoliveClient';
import { Subject } from 'rxjs';
import { NicoliveFailure, openErrorDialogFromFailure } from './NicoliveFailure';

interface INicoliveSupportersService {
  // supporter の userId 集合
  supporterIds: string[];
}

export class NicoliveSupportersService extends StatefulService<INicoliveSupportersService> {
  private client = new NicoliveClient({});

  static initialState: INicoliveSupportersService = {
    supporterIds: [],
  };
  private stateChangeSubject = new Subject<typeof this.state>();

  async update(): Promise<string[]> {
    const limit = 1000;
    const supporterIds: string[] = [];

    try {
      for (let offset = 0; ; offset += limit) {
        const response = await this.client.fetchSupporters({ limit, offset });
        if (!isOk(response)) {
          throw NicoliveFailure.fromClientError('fetchSupporters', response);
        }
        const value = response.value;

        supporterIds.push(...value.supporterIds);
        if (value.supporterIds.length < limit || supporterIds.length >= value.totalCount) {
          break;
        }
      }
      this.setState({ supporterIds });
      return supporterIds;
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        openErrorDialogFromFailure(caught);
      }
    }
  }

  private setState(state: INicoliveSupportersService) {
    this.SET_STATE(state);
    this.stateChangeSubject.next(state);
  }

  @mutation()
  private SET_STATE(nextState: INicoliveSupportersService) {
    this.state = nextState;
  }
}
