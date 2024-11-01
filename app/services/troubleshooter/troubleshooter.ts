import { IObsInput, IObsNumberInputValue, TObsFormData } from 'components/obs/inputs/ObsInput';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { $t } from 'services/i18n';
import { WindowsService } from 'services/windows';
import { Inject } from '../core/injector';
import { mutation } from '../core/stateful-service';
import {
  ITroubleshooterServiceApi,
  ITroubleshooterSettings,
  TIssueCode,
} from './troubleshooter-api';

interface ITroubleshooterState {
  settings: ITroubleshooterSettings;
}

export class TroubleshooterService
  extends PersistentStatefulService<ITroubleshooterState>
  implements ITroubleshooterServiceApi
{
  static defaultState: ITroubleshooterState = {
    settings: {
      skippedEnabled: false,
      skippedThreshold: 0.15,
      laggedEnabled: false,
      laggedThreshold: 0.15,
      droppedEnabled: false,
      droppedThreshold: 0.1,
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
        description: $t('notifications.detectSkippedFrames'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsNumberInputValue>{
        value: settings.skippedThreshold,
        name: 'skippedThreshold',
        description: $t('notifications.skippedFramesThreshold'),
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
        description: $t('notifications.detectLaggedFrames'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsNumberInputValue>{
        value: settings.laggedThreshold,
        name: 'laggedThreshold',
        description: $t('notifications.laggedFramesThreshold'),
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
        description: $t('notifications.detectDroppedFrames'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsNumberInputValue>{
        value: settings.droppedThreshold,
        name: 'droppedThreshold',
        description: $t('notifications.droppedFramesThreshold'),
        type: 'OBS_PROPERTY_SLIDER',
        minVal: 0,
        maxVal: 1,
        stepVal: 0.01,
        visible: settings.droppedEnabled,
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
      title: $t('troubleshooter.pageTitle'),
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
