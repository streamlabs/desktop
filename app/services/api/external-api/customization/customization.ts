import { CustomizationService as InternalCustomizationService } from 'services/customization';
import { Inject } from 'services/core/injector';
import { Fallback, Singleton } from 'services/api/external-api';
import { Observable, Subject } from 'rxjs';
import { ISerializable } from 'services/api/rpc-api';
import pick from 'lodash/pick';
import { map } from 'rxjs/operators';

interface IPinnedStatistics {
  cpu: boolean;
  fps: boolean;
  droppedFrames: boolean;
  bandwidth: boolean;
}

interface ICustomizationServiceState {
  hideViewerCount: boolean;
  dockCollapsed: boolean;
  /** @deprecated Kept for API compatibility, use `dockCollapsed`. */
  livedockCollapsed: boolean;
  performanceMode: boolean;
  chatZoomFactor: number;
  pinnedStatistics: IPinnedStatistics;
  theme: string;
  legacyAlertbox: boolean;
}

interface ICustomizationServiceStateUpdateSettings {
  hideViewerCount?: boolean;
  dockCollapsed?: boolean;
  /** @deprecated Kept for API compatibility, use `dockCollapsed`. Ignored if `dockCollapsed` is set. */
  livedockCollapsed?: boolean;
  performanceMode?: boolean;
}

/** API for getting and setting properties on the Customization service. */
@Singleton()
export class CustomizationService implements ISerializable {
  @Fallback()
  @Inject()
  private customizationService!: InternalCustomizationService;

  /**
   * Observable event that is triggered whenever the customization settings
   * change.
   *
   * The value of this event are the settings that have changed and is
   * represented by {@link ICustomizationServiceState}.
   *
   * @see ICustomizationServiceState
   */
  settingsChanged = this.customizationService.settingsChanged.pipe(map(_ => this.getModel()));

  /**
   * Returns the current settings state represented.
   *
   * @returns A serialized representation of {@link CustomizationService}
   *
   * @see {@link ICustomizationServiceState}
   */
  getModel(): ICustomizationServiceState {
    const state = this.customizationService.state;

    return {
      ...pick(state, [
        'hideViewerCount',
        'performanceMode',
        'chatZoomFactor',
        'pinnedStatistics',
        'theme',
        'legacyAlertbox',
      ]),
      dockCollapsed: state.dockCollapsed,
      livedockCollapsed: state.dockCollapsed,
    };
  }

  /**
   * Update the customization settings
   *
   * @param settingsPatch Customization settings to update
   * @see {@link ICustomizationServiceStateUpdateSettings}
   */
  setSettings(settingsPatch: Partial<ICustomizationServiceStateUpdateSettings>) {
    const { dockCollapsed, livedockCollapsed, ...rest } = pick(settingsPatch, [
      'hideViewerCount',
      'dockCollapsed',
      'livedockCollapsed',
      'performanceMode',
      'legacyAlertbox',
    ]);

    const collapsed = dockCollapsed ?? livedockCollapsed;

    this.customizationService.setSettings({
      ...rest,
      ...(collapsed != null ? { dockCollapsed: collapsed } : {}),
    });
  }

  /** @deprecated Kept for API compatibility, use `setDockCollapsed`. */
  setLiveDockCollapsed(collapsed: boolean) {
    this.customizationService.setDockCollapsed(collapsed);
  }
}
