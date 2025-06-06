import { Subject } from 'rxjs';
import { $t } from 'services/i18n';
import { Inject, Service } from 'services/core';
import { UserService } from 'services/user';
import { UsageStatisticsService } from 'services/usage-statistics';
import fs from 'fs-extra';
import path from 'path';
import { AppService } from './app';
import * as obs from '../../obs-api';
import { RealmObject } from './realm';
import { ObjectSchema } from 'realm';

export type TApplicationTheme = 'night-theme' | 'day-theme' | 'prime-dark' | 'prime-light';

// Maps to --background
const THEME_BACKGROUNDS = {
  'night-theme': { r: 23, g: 36, b: 45 },
  'prime-dark': { r: 17, g: 17, b: 17 },
  'day-theme': { r: 245, g: 248, b: 250 },
  'prime-light': { r: 243, g: 243, b: 243 },
};

// Maps to --section
const SECTION_BACKGROUNDS = {
  'night-theme': { r: 11, g: 22, b: 29 },
  'prime-dark': { r: 0, g: 0, b: 0 },
  'day-theme': { r: 227, g: 232, b: 235 },
  'prime-light': { r: 255, g: 255, b: 255 },
};

// Doesn't map 1:1
const DISPLAY_BACKGROUNDS = {
  'night-theme': { r: 11, g: 22, b: 29 },
  'prime-dark': { r: 37, g: 37, b: 37 },
  'day-theme': { r: 227, g: 232, b: 235 },
  'prime-light': { r: 255, g: 255, b: 255 },
};

export interface IPinnedStatistics {
  cpu: boolean;
  fps: boolean;
  droppedFrames: boolean;
  bandwidth: boolean;
}

export interface ICustomizationServiceState {
  nightMode?: string;
  theme: TApplicationTheme;
  updateStreamInfoOnLive: boolean;
  livePreviewEnabled: boolean;
  leftDock: boolean;
  hideViewerCount: boolean;
  folderSelection: boolean;
  legacyAlertbox: boolean | null;
  livedockCollapsed: boolean;
  livedockSize: number;
  eventsSize: number;
  controlsSize: number;
  performanceMode: boolean;
  chatZoomFactor: number;
  enableBTTVEmotes: boolean;
  enableFFZEmotes: boolean;
  mediaBackupOptOut: boolean;
  navigateToLiveOnStreamStart: boolean;
  experimental?: {
    volmetersFPSLimit?: number;
  };
  designerMode: boolean;
  legacyEvents: boolean;
  pinnedStatistics: IPinnedStatistics;
  enableCrashDumps: boolean;
  enableAnnouncements: boolean;
}

class PinnedStatistics extends RealmObject {
  cpu: boolean;
  fps: boolean;
  droppedFrames: boolean;
  bandwidth: boolean;

  static schema: ObjectSchema = {
    name: 'PinnedStatistics',
    embedded: true,
    properties: {
      cpu: { type: 'bool', default: false },
      fps: { type: 'bool', default: false },
      droppedFrames: { type: 'bool', default: false },
      bandwidth: { type: 'bool', default: false },
    },
  };
}

PinnedStatistics.register({ persist: true });

export class CustomizationState extends RealmObject {
  theme: TApplicationTheme;
  updateStreamInfoOnLive: boolean;
  livePreviewEnabled: boolean;
  leftDock: boolean;
  hideViewerCount: boolean;
  folderSelection: boolean;
  legacyAlertbox: boolean | null;
  livedockCollapsed: boolean;
  livedockSize: number;
  eventsSize: number;
  controlsSize: number;
  performanceMode: boolean;
  chatZoomFactor: number;
  enableBTTVEmotes: boolean;
  enableFFZEmotes: boolean;
  mediaBackupOptOut: boolean;
  navigateToLiveOnStreamStart: boolean;
  designerMode: boolean;
  legacyEvents: boolean;
  pinnedStatistics: PinnedStatistics;
  enableCrashDumps: boolean;
  enableAnnouncements: boolean;

  static schema: ObjectSchema = {
    name: 'CustomizationState',
    properties: {
      theme: { type: 'string', default: 'night-theme' },
      updateStreamInfoOnLive: { type: 'bool', default: true },
      livePreviewEnabled: { type: 'bool', default: true },
      leftDock: { type: 'bool', default: false },
      hideViewerCount: { type: 'bool', default: false },
      folderSelection: { type: 'bool', default: false },
      legacyAlertbox: { type: 'bool', default: false },
      livedockCollapsed: { type: 'bool', default: true },
      livedockSize: { type: 'double', default: 0 },
      eventsSize: { type: 'double', default: 156 },
      controlsSize: { type: 'double', default: 240 },
      performanceMode: { type: 'bool', default: false },
      chatZoomFactor: { type: 'double', default: 1 },
      enableBTTVEmotes: { type: 'bool', default: false },
      enableFFZEmotes: { type: 'bool', default: false },
      mediaBackupOptOut: { type: 'bool', default: false },
      navigateToLiveOnStreamStart: { type: 'bool', default: true },
      legacyEvents: { type: 'bool', default: false },
      designerMode: { type: 'bool', default: false },
      pinnedStatistics: { type: 'object', objectType: 'PinnedStatistics', default: {} },
      enableCrashDumps: { type: 'bool', default: true },
      enableAnnouncements: { type: 'bool', default: true },
    },
  };

  protected onCreated(): void {
    const data = localStorage.getItem('PersistentStatefulService-CustomizationService');

    if (data) {
      const parsed = JSON.parse(data);
      this.db.write(() => {
        Object.assign(this, parsed);
      });
    }
  }

  get isDarkTheme() {
    return ['night-theme', 'prime-dark'].includes(this.theme);
  }

  get displayBackground() {
    return DISPLAY_BACKGROUNDS[this.theme];
  }
}

CustomizationState.register({ persist: true });

/**
 * This class is used to store general UI behavior flags
 * that are sticky across application runtimes.
 */
export class CustomizationService extends Service {
  @Inject() userService: UserService;
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() appService: AppService;

  settingsChanged = new Subject<DeepPartial<CustomizationState>>();

  state = CustomizationState.inject();

  init() {
    super.init();
    this.setLiveDockCollapsed(true); // livedock is always collapsed on app start
    this.ensureCrashDumpFolder();
    this.setObsTheme();

    this.userService.userLoginFinished.subscribe(() => this.setInitialLegacyAlertboxState());

    if (
      this.state.pinnedStatistics.cpu ||
      this.state.pinnedStatistics.fps ||
      this.state.pinnedStatistics.droppedFrames ||
      this.state.pinnedStatistics.bandwidth
    ) {
      this.usageStatisticsService.recordFeatureUsage('PinnedPerformanceStatistics');
    }
  }

  setInitialLegacyAlertboxState() {
    if (!this.userService.views.isLoggedIn) return;

    // switch all new users to the new alertbox by default
    if (this.state.legacyAlertbox === null) {
      const registrationDate = this.userService.state.createdAt;
      const legacyAlertbox = registrationDate < new Date('October 26, 2021').valueOf();
      this.setSettings({ legacyAlertbox });
    }
  }

  setSettings(settingsPatch: DeepPartial<CustomizationState>) {
    this.state.db.write(() => {
      this.state.deepPatch(settingsPatch);
    });

    if (settingsPatch.enableCrashDumps != null) this.ensureCrashDumpFolder();

    this.settingsChanged.next(settingsPatch);
  }

  get currentTheme() {
    return this.state.theme;
  }

  setTheme(theme: TApplicationTheme) {
    obs.NodeObs.OBS_content_setDayTheme(['day-theme', 'prime-light'].includes(theme));
    return this.setSettings({ theme });
  }

  get themeBackground() {
    return THEME_BACKGROUNDS[this.currentTheme];
  }

  get sectionBackground() {
    return SECTION_BACKGROUNDS[this.currentTheme];
  }

  get isDarkTheme() {
    return this.state.isDarkTheme;
  }

  setUpdateStreamInfoOnLive(update: boolean) {
    this.setSettings({ updateStreamInfoOnLive: update });
  }

  setLivePreviewEnabled(enabled: boolean) {
    this.setSettings({ livePreviewEnabled: enabled });
  }

  setLeftDock(enabled: boolean) {
    this.setSettings({ leftDock: enabled });
  }

  setLiveDockCollapsed(collapsed: boolean) {
    this.setSettings({ livedockCollapsed: collapsed });
  }

  setHiddenViewerCount(hidden: boolean) {
    this.setSettings({ hideViewerCount: hidden });
  }

  setMediaBackupOptOut(optOut: boolean) {
    this.setSettings({ mediaBackupOptOut: optOut });
  }

  togglePerformanceMode() {
    this.setSettings({ performanceMode: !this.state.performanceMode });
  }

  setObsTheme() {
    obs.NodeObs.OBS_content_setDayTheme(!this.isDarkTheme);
  }

  get themeOptions() {
    const options = [
      { value: 'night-theme', label: $t('Night') },
      { value: 'day-theme', label: $t('Day') },
    ];

    if (this.userService.isPrime) {
      options.push(
        { value: 'prime-dark', label: $t('Obsidian Ultra') },
        { value: 'prime-light', label: $t('Alabaster Ultra') },
      );
    }
    return options;
  }

  restoreDefaults() {
    this.state.reset();
  }

  /**
   * Ensures that the existence of the crash dump folder matches the setting
   */
  ensureCrashDumpFolder() {
    const crashDumpDirectory = path.join(this.appService.appDataDirectory, 'CrashMemoryDump');

    // We do not care about the result of these calls;
    if (this.state.enableCrashDumps) {
      fs.ensureDir(crashDumpDirectory);
    } else {
      fs.remove(crashDumpDirectory);
    }
  }
}
