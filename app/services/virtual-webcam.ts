import { ExecuteInWorkerProcess, StatefulService, ViewHandler, mutation } from 'services/core';
import * as obs from '../../obs-api';
import path from 'path';
import { getChecksum } from 'util/requests';
import { byOS, OS } from 'util/operating-systems';
import { Inject } from 'services/core/injector';
import { SettingsService } from 'services/settings';
import { UsageStatisticsService, SourcesService } from 'app-services';
import * as remote from '@electron/remote';
import { Subject } from 'rxjs';
import { VCamOutputType } from 'obs-studio-node';
import { IOBSOutputSignalInfo } from './core/signals';
import os from 'os';
import { SignalsService } from './signals-manager';
import { $t } from 'services/i18n';

const PLUGIN_PLIST_PATH =
  '/Library/CoreMediaIO/Plug-Ins/DAL/vcam-plugin.plugin/Contents/Info.plist';

const INTERNAL_PLIST_PATH =
  'node_modules/obs-studio-node/data/obs-plugins/slobs-virtual-cam/Info.plist';

export enum EVirtualWebcamPluginInstallStatus {
  Installed = 'installed',
  NotPresent = 'notPresent',
  Outdated = 'outdated',
}

enum InstallationErrorCodes {
  OSSystemExtensionErrorUnknown = 1,
  OSSystemExtensionErrorMissingEntitlement = 2,
  OSSystemExtensionErrorUnsupportedParentBundleLocation = 3,
  OSSystemExtensionErrorExtensionNotFound = 4,
  OSSystemExtensionErrorExtensionMissingIdentifier = 5,
  OSSystemExtensionErrorDuplicateExtensionIdentifer = 6,
  OSSystemExtensionErrorUnknownExtensionCategory = 7,
  OSSystemExtensionErrorCodeSignatureInvalid = 8,
  OSSystemExtensionErrorValidationFailed = 9,
  OSSystemExtensionErrorForbiddenBySystemPolicy = 10,
  OSSystemExtensionErrorRequestCanceled = 11,
  OSSystemExtensionErrorRequestSuperseded = 12,
  OSSystemExtensionErrorAuthorizationRequired = 13,
  RebootRequired = 100, // slobs-virtualcam-installer custom error
  UserApprovalRequired = 101, // slobs-virtualcam-installer custom error
  MacOS13Unavailable = 102,
  UnknownError = 999, // slobs-virtualcam-installer custom error
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
  @Inject() signalsService: SignalsService;

  static initialState: IVirtualWebcamServiceState = {
    running: false,
    outputType: VCamOutputType.ProgramView,
    outputSelection: '',
    installStatus: EVirtualWebcamPluginInstallStatus.NotPresent,
  };

  runningChanged = new Subject<boolean>();
  installStatusChanged = new Subject<EVirtualWebcamPluginInstallStatus>();
  signalInfoChanged = new Subject<IOBSOutputSignalInfo>();

  protected init(): void {
    byOS({
      [OS.Windows]: () => {
        this.setInstallStatus();
      },
      [OS.Mac]: () => {
        const result = obs.NodeObs.OBS_service_isVirtualCamPluginInstalled();
        if (result === obs.EVcamInstalledStatus.Installed) {
          // Initialize the virtual cam
          this.signalsService.addCallback(this.handleSignalOutput);

          obs.NodeObs.OBS_service_createVirtualCam();
          this.signalInfoChanged.subscribe((signalInfo: IOBSOutputSignalInfo) => {
            console.log(`virtual cam init signalInfo: ${signalInfo.signal}`);
            this.setInstallStatus();
          });
        }
      },
    });
  }

  protected handleSignalOutput(info: IOBSOutputSignalInfo) {
    this.signalInfoChanged.next(info);
  }

  get views() {
    return new VirtualWebcamViews(this.state);
  }

  private getInstallErrorMessage(errorCode: number) {
    const codeName = InstallationErrorCodes[errorCode];
    console.log(`User experienced virtual cam installation error ${errorCode} value ${codeName}`);
    let errorMessage = '';
    switch (errorCode) {
      case InstallationErrorCodes.OSSystemExtensionErrorUnsupportedParentBundleLocation:
        errorMessage = $t(
          "Streamlabs Desktop cannot install the virtual camera if it's not in Applications. Please move Streamlabs Desktop to the Applications directory.",
        );
        break;
      case InstallationErrorCodes.RebootRequired:
        errorMessage = $t(
          'The installation of the virtual camera will complete after a system reboot.',
        );
        break;
      case InstallationErrorCodes.UserApprovalRequired:
        {
          // Get Darwin kernel version from os.release
          const darwinVersion = os.release().split('.')[0]; // Extract the major version number
          const isMacOS15OrGreater = Number(darwinVersion) >= 15;
          if (isMacOS15OrGreater) {
            errorMessage = $t(
              'The virtual camera is not installed.\n\nPlease allow Streamlabs Desktop to install the camera system extension in System Settings → General → Login Items & Extensions → Camera Extensions.\n\nYou may need to restart Streamlabs Desktop if this message still appears afterward.',
            );
          } else {
            errorMessage = $t(
              'The virtual camera is not installed.\n\nPlease allow Streamlabs Desktop to install system software in System Settings → Privacy & Security → Security.\n\nYou may need to restart Streamlabs Desktop if this message still appears afterward.',
            );
          }
        }
        break;
      case InstallationErrorCodes.MacOS13Unavailable:
        errorMessage = $t('Streamlabs Virtual Webcam feature requires macOS 13 or later.');
        break;
      default:
        errorMessage = $t('An error has occured while installing the virtual camera');
        break;
    }
    return errorMessage;
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
    const result = obs.NodeObs.OBS_service_isVirtualCamPluginInstalled();

    if (result === obs.EVcamInstalledStatus.Installed) {
      return EVirtualWebcamPluginInstallStatus.Installed;
    } else if (result === obs.EVcamInstalledStatus.LegacyInstalled) {
      return EVirtualWebcamPluginInstallStatus.Outdated;
    } else {
      return EVirtualWebcamPluginInstallStatus.NotPresent;
    }
  }

  @ExecuteInWorkerProcess()
  install() {
    byOS({
      [OS.Windows]: () => {
        obs.NodeObs.OBS_service_installVirtualCamPlugin();

        this.setInstallStatus();
      },
      [OS.Mac]: () => {
        this.signalsService.addCallback(this.handleSignalOutput);

        const errorCode = obs.NodeObs.OBS_service_installVirtualCamPlugin();
        if (errorCode > 0) {
          const errorMessage = this.getInstallErrorMessage(errorCode);
          remote.dialog.showErrorBox($t('Virtual Webcam'), errorMessage);
        } else {
          this.signalInfoChanged.subscribe((signalInfo: IOBSOutputSignalInfo) => {
            console.log(`virtual cam install signalInfo: ${signalInfo.signal}`);
            this.setInstallStatus();
            obs.NodeObs.OBS_service_createVirtualCam();
          });
        }
      },
    });
  }

  @ExecuteInWorkerProcess()
  uninstall() {
    const errorCode = obs.NodeObs.OBS_service_uninstallVirtualCamPlugin();
    if (errorCode > 0) {
      const codeName = InstallationErrorCodes[errorCode];
      console.log(`uninstalling virtual camera plugin error: ${errorCode} code: ${codeName}`);
      remote.dialog.showErrorBox(
        $t('Virtual Webcam'),
        $t('An error has occured while uninstalling the virtual camera'),
      );
      return;
    }
    this.SET_INSTALL_STATUS(EVirtualWebcamPluginInstallStatus.NotPresent);
    this.SET_OUTPUT_TYPE(VCamOutputType.ProgramView);

    // clearing the output selection from settings is needed to prevent stream errors
    this.settingsService.setSettingValue('Virtual Webcam', 'OutputSelection', '');
  }

  @ExecuteInWorkerProcess()
  start() {
    if (this.state.running) return;

    try {
      obs.NodeObs.OBS_service_startVirtualCam();
    } catch (error: unknown) {
      console.error('Caught OBS_service_startVirtualCam error:', error);
      remote.dialog.showErrorBox(
        $t('Virtual Webcam'),
        $t('Unable to start virtual camera.\n\nPlease try again.'),
      );
      return;
    }
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
