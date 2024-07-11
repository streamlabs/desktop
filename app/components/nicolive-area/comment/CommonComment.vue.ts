import { Component, Prop } from 'vue-property-decorator';
import { CommentBase } from './CommentBase';
import { NicoliveClient } from 'services/nicolive-program/NicoliveClient';
import * as remote from '@electron/remote';

@Component({})
export default class CommonComment extends CommentBase {
  @Prop({ default: false }) commentMenuOpened: boolean;
  @Prop() speaking: boolean;
  @Prop() nameplateHint: boolean;

  moderatorTooltip = 'モデレーター';
  supporterTooltip = 'サポーター';

  userIconURL: string = NicoliveClient.getUserIconURL(
    this.chat.value.user_id,
    `${this.chat.value.thread}`,
  );

  defaultUserIconURL = NicoliveClient.defaultUserIconURL;

  openInDefaultBrowser(event: MouseEvent): void {
    const href = (event.currentTarget as HTMLAnchorElement).href;
    const url = new URL(href);
    if (/^https?/.test(url.protocol)) {
      remote.shell.openExternal(url.toString());
    }
  }
}
