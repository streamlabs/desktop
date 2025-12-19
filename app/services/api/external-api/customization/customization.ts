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
  livedockCollapsed: boolean;
  performanceMode: boolean;
  chatZoomFactor: number;
  pinnedStatistics: IPinnedStatistics;
  theme: string;
  legacyAlertbox: boolean;
}

interface ICustomizationServiceStateUpdateSettings {
  hideViewerCount?: boolean;
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

    return pick(state, [
      'hideViewerCount',
      'livedockCollapsed',
      'performanceMode',
      'chatZoomFactor',
      'pinnedStatistics',
      'theme',
      'legacyAlertbox',
    ]);
  }

  /**
   * Update the customization settings
   *
   * @param settingsPatch Customization settings to update
   * @see {@link ICustomizationServiceStateUpdateSettings}
   */
  setSettings(settingsPatch: Partial<ICustomizationServiceStateUpdateSettings>) {
    const settings = pick(settingsPatch, [
      'hideViewerCount',
      'livedockCollapsed',
      'performanceMode',
      'legacyAlertbox',
    ]);

    this.customizationService.setSettings(settings);
  }
}
