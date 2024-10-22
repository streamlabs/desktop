import { Inject } from 'services/core/injector';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { HostsService } from 'services/hosts';
import { $t } from 'services/i18n';
import { WindowsService } from 'services/windows';
import { isFakeMode } from 'util/fakeMode';
import { handleErrors } from 'util/requests';
import { parseString } from 'xml2js';
import { InformationsStateService } from './state';

function parseXml(xml: String): Promise<object> {
  return new Promise((resolve, reject) => {
    parseString(xml, (err, result) => {
      if (err) {
        // sentryに送る
        console.error(err, xml);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

function pluckItems(feedResult: any) {
  return feedResult.rss.channel[0].item.map((i: any) => ({
    title: i.title[0],
    url: i.link[0],
    date: Date.parse(i.pubDate[0]),
  }));
}

interface IInformationsState {
  /** インフォ一覧を取得中か否か */
  fetching: boolean;
  /** インフォ一覧の取得中にエラーが発生したか否か */
  hasError: boolean;
  /** 取得済みのインフォ一覧 */
  informations: {
    /** インフォのタイトル */
    title: string;
    /** インフォ記事のURL */
    url: string;
    /** インフォの作成日 */
    date: number;
  }[];
}

export class InformationsService extends StatefulService<IInformationsState> {
  @Inject() hostsService: HostsService;
  @Inject() windowsService: WindowsService;
  @Inject('InformationsStateService') stateService: InformationsStateService;

  static initialState: IInformationsState = {
    fetching: false,
    hasError: false,
    informations: [],
  };

  static parseXml = parseXml;
  static pluckItems = pluckItems;

  get fetching() {
    return this.state.fetching;
  }
  get hasError() {
    return this.state.hasError;
  }
  get informations() {
    return this.state.informations;
  }

  afterInit() {
    super.afterInit();
    this.updateInformations();
  }

  private async fetchFeed() {
    this.SET_FETCHING(true);
    const headers = new Headers();
    headers.append('Cache-Control', 'max-age=0');

    try {
      return await fetch(this.hostsService.niconicoNAirInformationsFeed, { headers })
        .then(handleErrors)
        .then(response => response.text())
        .then(InformationsService.parseXml);
    } finally {
      this.SET_FETCHING(false);
    }
  }

  async updateInformations() {
    if (isFakeMode()) return;
    this.SET_HAS_ERROR(false);
    try {
      const feedResult = await this.fetchFeed();
      const informations = InformationsService.pluckItems(feedResult);
      this.SET_INFORMATIONS(informations);
    } catch (e) {
      console.error(e);
      this.SET_HAS_ERROR(true);
    }
  }

  get hasUnseenItem() {
    if (this.state.fetching) return false;
    return this.state.informations.some(item => item.date > this.stateService.lastOpen);
  }

  updateLastOpen(now: number) {
    this.stateService.updateLastOpen(now);
  }

  @mutation()
  private SET_FETCHING(fetching: boolean) {
    this.state.fetching = fetching;
  }

  @mutation()
  private SET_HAS_ERROR(hasError: boolean) {
    this.state.hasError = hasError;
  }

  @mutation()
  private SET_INFORMATIONS(informations: any[]) {
    this.state = { ...this.state, informations };
  }

  showInformations() {
    this.windowsService.showWindow({
      componentName: 'Informations',
      title: $t('informations.title'),
      queryParams: {},
      size: {
        width: 600,
        height: 400,
      },
    });
  }
}
