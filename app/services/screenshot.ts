import fs from 'fs';
import path from 'path';
import * as remote from '@electron/remote';
import { Inject, Service } from 'services/core';
import * as obs from '../../obs-api';
import { $t } from './i18n';
import { SettingsService } from './settings';
import { OutputSettingsService } from './settings/output';
import { TDisplayType, VideoSettingsService } from './settings-v2/video';
import { ENotificationType, NotificationsService } from './notifications';
import { JsonrpcService } from './api/jsonrpc';
import { UsageStatisticsService } from './usage-statistics';

/** OBS's default "Filename Formatting", used when the setting is empty. */
const DEFAULT_FILENAME_FORMAT = '%CCYY-%MM-%DD %hh-%mm-%ss';

/**
 * Saves a still of the program output, the way OBS Studio's "Screenshot Output"
 * hotkey does: a PNG at canvas resolution, written to the recording folder as
 * `Screenshot <Filename Formatting>.png`. The capture itself happens in the OBS
 * backend (`OBS_content_takeScreenshot`); this service supplies the settings and
 * reports the result.
 */
export class ScreenshotService extends Service {
  @Inject() private settingsService: SettingsService;
  @Inject() private outputSettingsService: OutputSettingsService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  takeScreenshot(display: TDisplayType = 'horizontal') {
    if (typeof obs.NodeObs.OBS_content_takeScreenshot !== 'function') {
      this.warn($t('Screenshots need a newer version of the Streamlabs backend.'));
      return;
    }

    const context =
      this.videoSettingsService.contexts[display] ?? this.videoSettingsService.contexts.horizontal;
    if (!context) {
      this.warn($t('Could not save screenshot'));
      return;
    }

    const directory = this.outputSettingsService.getRecordingSettings(display).path;
    if (!directory || !fs.existsSync(directory)) {
      this.warn($t('Set a recording folder in Settings > Output before taking a screenshot.'));
      return;
    }

    const output = this.settingsService.state.Output.formData;
    const advanced = this.settingsService.state.Advanced.formData;
    const mode = this.settingsService.findSettingValue(output, 'Untitled', 'Mode');
    const noSpaceKey = mode === 'Advanced' ? 'RecFileNameWithoutSpace' : 'FileNameWithoutSpace';
    const noSpace = !!this.settingsService.findSettingValue(output, 'Recording', noSpaceKey);
    const format: string =
      this.settingsService.findSettingValue(advanced, 'Recording', 'FilenameFormatting') ||
      DEFAULT_FILENAME_FORMAT;

    try {
      const result = obs.NodeObs.OBS_content_takeScreenshot(context, directory, format, noSpace);
      this.notificationsService.push({
        type: ENotificationType.SUCCESS,
        message: $t('Screenshot saved as %{filename}', { filename: path.basename(result.path) }),
        action: this.jsonrpcService.createRequest(
          Service.getResourceId(this),
          'showScreenshot',
          result.path,
        ),
      });
      this.usageStatisticsService.recordFeatureUsage('ScreenshotOutput');
    } catch (e: unknown) {
      console.error('Failed to take screenshot', e);
      this.warn($t('Could not save screenshot'));
    }
  }

  showScreenshot(filePath: string) {
    remote.shell.showItemInFolder(filePath);
  }

  private warn(message: string) {
    this.notificationsService.push({ type: ENotificationType.WARNING, message });
  }
}
