import * as remote from '@electron/remote';
import { clipboard } from 'electron';
import { DateTime } from 'luxon';
import { Subscription } from 'rxjs';
import { Inject } from 'services/core/injector';
import { HostsService } from 'services/hosts';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { StreamingService } from 'services/streaming';
import { UserService } from 'services/user';
import Vue from 'vue';
import Popper from 'vue-popperjs';
import { Component } from 'vue-property-decorator';

@Component({
  components: {
    Popper,
  },
})
export default class ProgramInfo extends Vue {
  @Inject()
  nicoliveProgramService: NicoliveProgramService;
  @Inject() streamingService: StreamingService;
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService;

  private subscription: Subscription = null;

  showPopupMenu: boolean = false;
  popper: PopperEvent;

  get isOnAir(): boolean {
    return this.nicoliveProgramService.state.status === 'onAir';
  }

  mounted() {
    this.subscription = this.nicoliveProgramService.stateChange.subscribe(state => {
      if (state.status === 'end') {
        if (this.streamingService.isStreaming) {
          this.streamingService.toggleStreamingAsync();
        }
      }
    });
  }

  destroyed() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  get programID(): string {
    return this.nicoliveProgramService.state.programID;
  }

  get programStatus(): string {
    return this.nicoliveProgramService.state.status;
  }

  get programTitle(): string {
    return this.nicoliveProgramService.state.title;
  }

  get userName(): string {
    return this.userService.username;
  }

  get userIcon(): string {
    return this.userService.userIcon;
  }

  get autoExtensionEnabled() {
    return this.nicoliveProgramService.state.autoExtensionEnabled;
  }
  toggleAutoExtension() {
    this.nicoliveProgramService.toggleAutoExtension();
  }

  openInDefaultBrowser(event: MouseEvent): void {
    const href = (event.currentTarget as HTMLAnchorElement).href;
    const url = new URL(href);
    if (/^https?/.test(url.protocol)) {
      remote.shell.openExternal(url.toString());
    }
  }

  get watchPageURL(): string {
    return this.hostsService.getWatchPageURL(this.programID);
  }

  async editProgram() {
    try {
      return await this.nicoliveProgramService.editProgram();
    } catch (e) {
      // TODO 失敗時にはユーザーに伝えるべき
      console.warn(e);
    }
  }

  get contentTreeURL(): string {
    return this.hostsService.getContentTreeURL(this.programID);
  }

  get creatorsProgramURL(): string {
    return this.hostsService.getCreatorsProgramURL(this.programID);
  }

  get xShareURL(): string {
    const content = this.xShareContent();
    const url = new URL('https://x.com/intent/tweet');
    url.searchParams.append('text', content.text);
    url.searchParams.append('url', content.url);
    return url.toString();
  }

  private xShareContent(): { text: string; url: string } {
    const title = this.nicoliveProgramService.state.title;
    const url = `${this.hostsService.getWatchPageURL(this.programID)}?ref=sharetw`;
    const time = this.nicoliveProgramService.state.startTime;
    const formattedTime = DateTime.fromSeconds(time).toFormat('yyyy/MM/dd HH:mm');

    if (this.programStatus === 'reserved' || this.programStatus === 'test') {
      return {
        text: `【ニコ生(${formattedTime}開始)】${title}`,
        url,
      };
    }

    if (this.programStatus === 'onAir') {
      return {
        text: `【ニコ生配信中】${title}`,
        url,
      };
    }

    if (this.programStatus === 'end') {
      return {
        text: `【ニコ生タイムシフト視聴中(${formattedTime}放送)】${title}`,
        url,
      };
    }
  }

  get isFetching(): boolean {
    return this.nicoliveProgramService.state.isFetching;
  }

  copyProgramURL() {
    if (this.isFetching) throw new Error('fetchProgram is running');
    clipboard.writeText(
      this.hostsService.getWatchPageURL(this.nicoliveProgramService.state.programID),
    );
  }
  get existsProgramPassword(): boolean {
    return !!this.nicoliveProgramService.state.password;
  }
  copyProgramPassword() {
    if (this.isFetching) throw new Error('fetchProgram is running');
    clipboard.writeText(this.nicoliveProgramService.state.password);
  }
}
