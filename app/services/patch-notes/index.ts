import { PersistentStatefulService, mutation, Service, Inject } from 'services';
import electron from 'electron';
import Util from 'services/utils';
import { notes } from './notes';
import { NavigationService } from 'services/navigation';
import { $t } from 'services/i18n';
import { NotificationsService, ENotificationType } from 'services/notifications';
import { JsonrpcService } from 'services/api/jsonrpc/jsonrpc';
import { getOS, OS } from 'util/operating-systems';
import { WindowsService } from 'services/windows';

interface IPatchNotesState {
  lastVersionSeen: string;
  updateTimestamp: string;
}

export interface IPatchNotes {
  version: string;
  title: string;
  notes: string[];
  showChest: boolean;
}

export class PatchNotesService extends PersistentStatefulService<IPatchNotesState> {
  @Inject() navigationService: NavigationService;
  @Inject() notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() windowsService: WindowsService;

  static defaultState: IPatchNotesState = {
    lastVersionSeen: null,
    updateTimestamp: null,
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
    // Don't show the patch notes in dev mode or preview
    if (Util.isDevMode() || Util.isPreview() || Util.isIpc()) return;

    const minorVersionRegex = /^(\d+\.\d+)\.\d+$/;
    const currentMinorVersion = Util.env.SLOBS_VERSION.match(minorVersionRegex);
    const patchNotesMinorVesion = notes.version.match(minorVersionRegex);
    const lastMinorVersionSeen = this.state.lastVersionSeen
      ? this.state.lastVersionSeen.match(minorVersionRegex)
      : null;

    // One of the version strings was malformed
    if (!currentMinorVersion || !patchNotesMinorVesion) return;

    // If the patch notes don't match the current verison, don't show them
    if (currentMinorVersion[1] !== patchNotesMinorVesion[1]) return;

    // The user has already seen the current patch notes
    if (lastMinorVersionSeen && lastMinorVersionSeen[1] === currentMinorVersion[1]) return;

    this.SET_LAST_VERSION_SEEN(Util.env.SLOBS_VERSION, new Date().toISOString());

    // Only show the actual patch notes if they weren't onboarded
    if (!onboarded) {
      this.notificationsService.push({
        type: ENotificationType.SUCCESS,
        lifeTime: 30000,
        showTime: false,
        playSound: false,
        message: $t('Streamlabs Desktop has updated! Click here to see what changed.'),
        action: this.jsonrpcService.createRequest(
          Service.getResourceId(this.navigationService),
          'navigate',
          'PatchNotes',
        ),
      });
    }
  }

  get notes() {
    return notes;
  }

  @mutation()
  private SET_LAST_VERSION_SEEN(version: string, timestamp: string) {
    this.state.lastVersionSeen = version;
    this.state.updateTimestamp = timestamp;
  }
}
