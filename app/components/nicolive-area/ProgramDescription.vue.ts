import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import * as remote from '@electron/remote';
import { apply as applyAutoLink } from 'util/autoLink';

@Component({})
export default class ProgramDescription extends Vue {
  @Inject()
  nicoliveProgramService: NicoliveProgramService;

  get programDescription(): string {
    return applyAutoLink(this.nicoliveProgramService.state.description);
  }

  /**
   * 番組詳細のリンクを既定のブラウザで開く
   * anchor要素は自動リンクによってしか生成されないので、anchor要素の子はテキストノードのみ
   **/
  handleAnchorClick(event: MouseEvent): void {
    if (!(event.target instanceof HTMLAnchorElement)) return;

    event.preventDefault();
    const url = event.target.href;
    try {
      const parsed = new URL(url);
      if (parsed.protocol.match(/https?/)) {
        remote.shell.openExternal(parsed.href);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
