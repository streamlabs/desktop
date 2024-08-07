import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import electron from 'electron';
import Util from 'services/utils';
import { notes } from './notes';
import { NavigationService } from 'services/navigation';
import { Inject } from 'services/core/injector';
import * as remote from '@electron/remote';

interface IPatchNotesState {
  lastVersionSeen: string;
}

export interface IPatchNotes {
  version: string;
  title: string;
  notes: string[];
}

export class PatchNotesService extends PersistentStatefulService<IPatchNotesState> {
  @Inject() navigationService: NavigationService;

  static defaultState: IPatchNotesState = {
    lastVersionSeen: null,
  };

  init() {
    super.init();

    if (Util.isDevMode()) {
      // Useful for previewing patch notes in dev mode
      window['showPatchNotes'] = () => {
        this.navigationService.navigate('PatchNotes');
      };
    }
  }

  /**
   * Will show the latest patch notes if they are available and
   * the user has not seen them.
   * @param onboarded Whether the user was onboarded this session
   */
  showPatchNotesIfRequired(onboarded: boolean) {
    // Don't show the patch notes in dev mode
    if (Util.isDevMode()) return;

    // We do not show patch notes for preview
    if (Util.isPreview()) return;
    if (Util.isIpc()) return;

    const currentVersion = remote.process.env.NAIR_VERSION;

    // If the notes don't match the current version, we shouldn't
    // show them.
    if (notes.version !== currentVersion) return;

    // The user has already seen the current patch notes
    if (currentVersion === this.state.lastVersionSeen) return;

    this.SET_LAST_VERSION_SEEN(currentVersion);

    // Only show the actual patch notes if they weren't onboarded
    if (!onboarded) {
      // ここですぐ遷移してしまうと起動時の studio の vue-sliderの非同期処理が途中なため例外が発生する。
      // それを回避するため setTimeoutで遅延させる
      setTimeout(() => {
        this.navigationService.navigate('PatchNotes');
      }, 0);
    }
  }

  get notes() {
    return notes;
  }

  @mutation()
  private SET_LAST_VERSION_SEEN(version: string) {
    this.state.lastVersionSeen = version;
  }
}
