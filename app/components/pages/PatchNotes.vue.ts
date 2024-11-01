import { Inject } from 'services/core/injector';
import { NavigationService } from 'services/navigation';
import { PatchNotesService } from 'services/patch-notes';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';

@Component({})
export default class Dashboard extends Vue {
  @Inject() patchNotesService: PatchNotesService;
  @Inject() navigationService: NavigationService;

  get notes() {
    return this.patchNotesService.notes;
  }

  done() {
    this.navigationService.navigate('Studio');
  }
}
