import { mutation } from '../core/stateful-service';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { IObsInput, IObsNumberInputValue, TObsFormData } from 'components/obs/inputs/ObsInput';
import {
  ITroubleshooterServiceApi,
  ITroubleshooterSettings,
  TIssueCode,
} from './troubleshooter-api';
import { WindowsService } from 'services/windows';
import { Inject } from '../core/injector';
import { $t } from 'services/i18n';

interface ITroubleshooterState {
  settings: ITroubleshooterSettings;
}

export class TroubleshooterService
  extends PersistentStatefulService<ITroubleshooterState>
  implements ITroubleshooterServiceApi {
  static defaultState: ITroubleshooterState = {
    settings: {
      skippedEnabled: true,
      skippedThreshold: 0.25,
      laggedEnabled: false,
      laggedThreshold: 0.25,
      droppedEnabled: true,
      droppedThreshold: 0.25,
      dualOutputCpuEnabled: true,
      dualOutputCpuThreshold: 0.3,
    },
  };

  @Inject() private windowsService: WindowsService;

  getSettings(): ITroubleshooterSettings {
    return this.state.settings;
  }

  getSettingsFormData(): TObsFormData {
    const settings = this.state.settings;

    return [
      <IObsInput<boolean>>{
        value: settings.skippedEnabled,
        name: 'skippedEnabled',
        description: $t('Detect skipped frames'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsNumberInputValue>{
        value: settings.skippedThreshold,
        name: 'skippedThreshold',
        description: $t('Skipped frames threshold'),
        type: 'OBS_PROPERTY_SLIDER',
        minVal: 0,
        maxVal: 1,
        stepVal: 0.01,
        visible: settings.skippedEnabled,
        enabled: true,
        usePercentages: true,
      },

      <IObsInput<boolean>>{
        value: settings.laggedEnabled,
        name: 'laggedEnabled',
        description: $t('Detect lagged frames'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsNumberInputValue>{
        value: settings.laggedThreshold,
        name: 'laggedThreshold',
        description: $t('Lagged frames threshold'),
        type: 'OBS_PROPERTY_SLIDER',
        minVal: 0,
        maxVal: 1,
        stepVal: 0.01,
        visible: settings.laggedEnabled,
        enabled: true,
        usePercentages: true,
      },

      <IObsInput<boolean>>{
        value: settings.droppedEnabled,
        name: 'droppedEnabled',
        description: $t('Detect dropped frames'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsNumberInputValue>{
        value: settings.droppedThreshold,
        name: 'droppedThreshold',
        description: $t('Dropped frames threshold'),
        type: 'OBS_PROPERTY_SLIDER',
        minVal: 0,
        maxVal: 1,
        stepVal: 0.01,
        visible: settings.droppedEnabled,
        enabled: true,
        usePercentages: true,
      },

      <IObsInput<boolean>>{
        value: settings.dualOutputCpuEnabled,
        name: 'dualOutputCpuEnabled',
        description: $t('Detect CPU usage in Dual Output mode'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsNumberInputValue>{
        value: settings.dualOutputCpuThreshold,
        name: 'dualOutputCpuThreshold',
        description: $t('CPU usage threshold in Dual Output mode'),
        type: 'OBS_PROPERTY_SLIDER',
        minVal: 0,
        maxVal: 1,
        stepVal: 0.01,
        visible: settings.dualOutputCpuEnabled,
        enabled: true,
        usePercentages: true,
      },
    ];
  }

  setSettings(settingsPatch: Partial<ITroubleshooterSettings>) {
    this.SET_SETTINGS(settingsPatch);
  }

  restoreDefaultSettings() {
    this.setSettings(TroubleshooterService.defaultState.settings);
  }

  showTroubleshooter(issueCode: TIssueCode) {
    this.windowsService.showWindow({
      componentName: 'Troubleshooter',
      title: $t('Troubleshooter'),
      queryParams: { issueCode },
      size: {
        width: 500,
        height: 500,
      },
    });
  }

  @mutation()
  private SET_SETTINGS(settingsPatch: Partial<ITroubleshooterSettings>) {
    this.state.settings = { ...this.state.settings, ...settingsPatch };
  }
}
