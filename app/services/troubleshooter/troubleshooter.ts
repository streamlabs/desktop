import { mutation, ViewHandler } from '../core/stateful-service';
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

class TroubleshooterViews extends ViewHandler<ITroubleshooterState> {
  get metadata() {
    return {
      skippedEnabled: {
        type: 'checkbox',
        label: $t('Detect skipped frames'),
        children: {
          skippedThreshold: {
            type: 'slider',
            label: $t('Skipped frames threshold'),
            min: 0,
            max: 1,
            step: 0.01,
            usePercentages: true,
            displayed: this.state.settings.skippedEnabled,
          },
        },
      },
      laggedEnabled: {
        type: 'checkbox',
        label: $t('Detect lagged frames'),
        children: {
          laggedThreshold: {
            type: 'slider',
            label: $t('Lagged frames threshold'),
            min: 0,
            max: 1,
            step: 0.01,
            usePercentages: true,
            displayed: this.state.settings.laggedEnabled,
          },
        },
      },
      droppedEnabled: {
        type: 'checkbox',
        label: $t('Detect dropped frames'),
        children: {
          droppedThreshold: {
            type: 'slider',
            label: $t('Dropped frames threshold'),
            min: 0,
            max: 1,
            step: 0.01,
            usePercentages: true,
            displayed: this.state.settings.droppedEnabled,
          },
        },
      },
      dualOutputCpuEnabled: {
        type: 'checkbox',
        label: $t('Detect CPU usage in Dual Output mode'),
        children: {
          dualOutputCpuThreshold: {
            type: 'slider',
            label: $t('CPU usage threshold in Dual Output mode'),
            min: 0,
            max: 1,
            step: 0.01,
            usePercentages: true,
            displayed: this.state.settings.dualOutputCpuEnabled,
          },
        },
      },
    };
  }

  get settings() {
    return this.state.settings;
  }
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

  get views() {
    return new TroubleshooterViews(this.state);
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
