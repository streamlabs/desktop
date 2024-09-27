import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { WindowsService } from 'services/windows';
import { InformationsService } from 'services/informations';
import ModalLayout from 'components/ModalLayout.vue';
import { shell } from 'electron';
import { DateTime } from 'luxon';

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

@Component({
  components: { ModalLayout },
})
export default class Informations extends Vue {
  @Inject() informationsService: InformationsService;
  @Inject() windowsService: WindowsService;

  mounted() {
    this.informationsService.updateInformations();
    this.informationsService.updateLastOpen(Date.now());
  }

  get fetching() {
    return this.informationsService.fetching;
  }

  get hasError() {
    return this.informationsService.hasError;
  }

  get informations() {
    return this.informationsService.informations;
  }

  format(unixtime: number) {
    return DateTime.fromMillis(unixtime).toFormat('yyyy-MM-dd');
  }

  shouldShowNewLabel(unixtime: number) {
    return unixtime > Date.now() - ONE_WEEK;
  }

  handleAnchorClick(event: MouseEvent) {
    event.preventDefault();
    const url = (event.currentTarget as HTMLAnchorElement).href;
    try {
      const parsed = new URL(url);
      if (parsed.protocol.match(/https?/)) {
        shell.openExternal(parsed.href);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
