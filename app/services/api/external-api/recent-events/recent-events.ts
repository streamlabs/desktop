import { RecentEventsService as InternalRecentEventsService } from 'services/recent-events';
import { Inject } from 'services/core/injector';
import { Fallback, Singleton } from 'services/api/external-api';
import { Observable } from 'rxjs';
import { ISerializable } from 'services/api/rpc-api';

/**
 * Possible safe mode states
 */
enum ESafeModeStatus {
  Disabled = 'disabled',
  Enabled = 'enabled',
}

interface ERecentEventsModel {
  isSafeModeEnabled: boolean;
}

/** API for interacting with Recent Events, at the moment includes only Safe Mode state and toggle methods */
@Singleton()
export class RecentEventsService implements ISerializable {
  @Fallback()
  @Inject()
  private recentEventsService: InternalRecentEventsService;

  /**
   * Observable event that is triggered whenever the safe mode status
   * changes due to being enabled or disabled. This will also trigger
   * when we fetch the status from the server.
   *
   * The value of this event is the current safe mode enabled state,
   * and is represented by {@link ESafeModeStatus}.
   *
   * @see ESafeModeStatus
   */
  get safeModeStatusChanged(): Observable<ESafeModeStatus> {
    return this.recentEventsService.safeModeStatusChanged;
  }

  /**
   * Returns the current recent events state represented.
   *
   * @returns A serialized representation of {@link RecentEventsService}
   */
  getModel(): ERecentEventsModel {
    const state = this.recentEventsService.state;

    return {
      isSafeModeEnabled: state.safeMode.enabled,
    };
  }

  /**
   * Enables safe mode.
   */
  enableSafeMode(): void {
    this.recentEventsService.activateSafeMode();
  }

  /**
   * Disables safe mode.
   */
  disableSafeMode(): void {
    this.recentEventsService.disableSafeMode();
  }
}
