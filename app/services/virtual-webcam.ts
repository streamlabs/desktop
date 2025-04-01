import { ExecuteInWorkerProcess, StatefulService, ViewHandler, mutation } from 'services/core';
import * as obs from '../../obs-api';
import fs from 'fs';
import path from 'path';
import { getChecksum } from 'util/requests';
import { byOS, OS } from 'util/operating-systems';
import { Inject } from 'services/core/injector';
import { SettingsService } from 'services/settings';
import { UsageStatisticsService, SourcesService } from 'app-services';
import * as remote from '@electron/remote';
import { Subject } from 'rxjs';
import { ESourceOutputFlags, VCamOutputType } from 'obs-studio-node';

const PLUGIN_PLIST_PATH =
  '/Library/CoreMediaIO/Plug-Ins/DAL/vcam-plugin.plugin/Contents/Info.plist';

const INTERNAL_PLIST_PATH =
  'node_modules/obs-studio-node/data/obs-plugins/slobs-virtual-cam/Info.plist';

export enum EVirtualWebcamPluginInstallStatus {
  Installed = 'installed',
  NotPresent = 'notPresent',
  Outdated = 'outdated',
}

export type TVirtualWebcamPluginInstallStatus =
  | keyof typeof EVirtualWebcamPluginInstallStatus
  | null;

interface IVirtualWebcamServiceState {
  running: boolean;
  outputType: VCamOutputType;
  outputSelection: string;
  installStatus: EVirtualWebcamPluginInstallStatus;
}

export class VirtualWebcamService extends StatefulService<IVirtualWebcamServiceState> {
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() sourcesService: SourcesService;
  @Inject() settingsService: SettingsService;

  static initialState: IVirtualWebcamServiceState = {
    running: false,
    outputType: VCamOutputType.ProgramView,
    outputSelection: '',
    installStatus: EVirtualWebcamPluginInstallStatus.NotPresent,
  };

  runningChanged = new Subject<boolean>();
  installStatusChanged = new Subject<EVirtualWebcamPluginInstallStatus>();

  protected init(): void {
    this.setInstallStatus();
  }

  get views() {
    return new VirtualWebcamViews(this.state);
  }

  /**
   * Set the virtual camera install status
   * @remark This method wraps getting the install status in a try/catch block
   * to prevent infinite loading from errors
   */
  @ExecuteInWorkerProcess()
  setInstallStatus() {
    try {
      const installStatus = this.getInstallStatus();
      this.SET_INSTALL_STATUS(installStatus);
    } catch (error: unknown) {
      console.error('Error resolving install status:', error);
      this.SET_INSTALL_STATUS(EVirtualWebcamPluginInstallStatus.NotPresent);
    }

    this.installStatusChanged.next(this.state.installStatus);
  }

  @ExecuteInWorkerProcess()
  getInstallStatus(): EVirtualWebcamPluginInstallStatus {
    return byOS({
      [OS.Mac]: () => {
        try {
          const exists = fs.existsSync(PLUGIN_PLIST_PATH);
          if (exists) {
            const latest = this.getCurrentChecksum();
            const installed = getChecksum(PLUGIN_PLIST_PATH);

            if (latest === installed) {
              return EVirtualWebcamPluginInstallStatus.Installed;
            }

            return EVirtualWebcamPluginInstallStatus.Outdated;
          }

          return EVirtualWebcamPluginInstallStatus.NotPresent;
        } catch (e: unknown) {
          console.error('Error comparing checksums on virtual webcam', e);
          return EVirtualWebcamPluginInstallStatus.Outdated;
        }
      },
      [OS.Windows]: () => {
        const result = obs.NodeObs.OBS_service_isVirtualCamPluginInstalled();

        if (result === obs.EVcamInstalledStatus.Installed) {
          return EVirtualWebcamPluginInstallStatus.Installed;
        } else if (result === obs.EVcamInstalledStatus.LegacyInstalled) {
          return EVirtualWebcamPluginInstallStatus.Outdated;
        } else {
          return EVirtualWebcamPluginInstallStatus.NotPresent;
        }
      },
    });
  }

  @ExecuteInWorkerProcess()
  install() {
    obs.NodeObs.OBS_service_installVirtualCamPlugin();

    this.setInstallStatus();
  }

  @ExecuteInWorkerProcess()
  uninstall() {
    obs.NodeObs.OBS_service_uninstallVirtualCamPlugin();

    this.SET_INSTALL_STATUS(EVirtualWebcamPluginInstallStatus.NotPresent);
    this.SET_OUTPUT_TYPE(VCamOutputType.ProgramView);

    // clearing the output selection from settings is needed to prevent stream errors
    this.settingsService.setSettingValue('Virtual Webcam', 'OutputSelection', '');
  }

  @ExecuteInWorkerProcess()
  start() {
    if (this.state.running) return;

    //obs.NodeObs.OBS_service_createVirtualWebcam('Streamlabs Desktop Virtual Webcam');
    obs.NodeObs.OBS_service_startVirtualCam();

    this.SET_RUNNING(true);
    this.runningChanged.next(true);

    this.usageStatisticsService.recordFeatureUsage('VirtualWebcam');
  }

  @ExecuteInWorkerProcess()
  stop() {
    if (!this.state.running) return;

    obs.NodeObs.OBS_service_stopVirtualCam();

    this.SET_RUNNING(false);
    this.runningChanged.next(false);
  }

  private getCurrentChecksum() {
    const internalPlistPath = path.join(remote.app.getAppPath(), INTERNAL_PLIST_PATH);
    return getChecksum(internalPlistPath);
  }

  @ExecuteInWorkerProcess()
  update(type: VCamOutputType, name: string) {
    obs.NodeObs.OBS_service_updateVirtualCam(type, name);

    const outputSelection = type === VCamOutputType.ProgramView ? '' : name;

    if (type !== this.state.outputType) {
      this.SET_OUTPUT_TYPE(type);
      this.SET_OUTPUT_SELECTION(outputSelection);
    }
  }

  @mutation()
  private SET_RUNNING(running: boolean) {
    this.state.running = running;
  }

  @mutation()
  private SET_OUTPUT_TYPE(type: VCamOutputType) {
    this.state.outputType = type;
  }

  @mutation()
  private SET_OUTPUT_SELECTION(selection: string) {
    this.state.outputSelection = selection;
  }

  @mutation()
  private SET_INSTALL_STATUS(installStatus: EVirtualWebcamPluginInstallStatus) {
    this.state.installStatus = installStatus;
  }
}
class VirtualWebcamViews extends ViewHandler<IVirtualWebcamServiceState> {
  get running() {
    return this.state.running;
  }

  get outputType() {
    return this.state.outputType.toString();
  }

  get outputSelection() {
    return this.state.outputSelection;
  }

  get installStatus(): EVirtualWebcamPluginInstallStatus {
    return this.state.installStatus;
  }
}
