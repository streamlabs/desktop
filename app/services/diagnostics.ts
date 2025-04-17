/*global SLOBS_BUNDLE_ID*/

import { InitAfter, Inject, mutation, PersistentStatefulService } from 'services/core';
import { EEncoderFamily, OutputSettingsService, SettingsService } from './settings';
import * as cp from 'child_process';
import prettyBytes from 'pretty-bytes';
import Utils from './utils';
import os from 'os';
import { EDeviceType, HardwareService, IDevice } from './hardware';
import { SceneItem, ScenesService } from './scenes';
import { UserService } from './user';
import { SourceFiltersService } from './source-filters';
import { StreamingService } from './api/external-api/streaming';
import { EStreamingState } from './streaming';
import Vue from 'vue';
import { PerformanceService } from './performance';
import { jfetch } from 'util/requests';
import { CacheUploaderService } from './cache-uploader';
import { AudioService } from './audio';
import { getOS, OS } from 'util/operating-systems';
import { Source, SourcesService } from './sources';
import { VideoEncodingOptimizationService } from './video-encoding-optimizations';
import {
  DualOutputService,
  RecordingModeService,
  StreamSettingsService,
  TransitionsService,
  VideoService,
} from 'app-services';
import * as remote from '@electron/remote';
import { AppService } from 'services/app';
import fs from 'fs';
import path from 'path';
import { platformList, TPlatform } from './platforms';
import { TDisplayType } from 'services/video';

interface IStreamDiagnosticInfo {
  startTime: number;
  endTime?: number;
  pctSkipped?: number;
  pctLagged?: number;
  pctDropped?: number;
  avgFps?: number;
  avgCpu?: number;
  error?: string;
  platforms?: string;
  destinations?: string;
  type?: string;
}

interface IDiagnosticsServiceState {
  streams: IStreamDiagnosticInfo[];
}

/**
 * Accumulator for keeping a running average of values
 * without keeping all samples in memory.
 */
class Accumulator {
  public average = 0;
  public nSamples = 0;
  public lastValue: number = null;

  sample(val: number) {
    this.lastValue = val;
    this.average = (this.average * this.nSamples + val) / (this.nSamples + 1);
    this.nSamples++;
  }
}

const STREAM_HISTORY_LENGTH = 5;
const STATS_FLUSH_INTERVAL = 60 * 1000;

class Section {
  str = '';

  constructor(title: string, data: object | string) {
    this.wl('-'.repeat(title.length + 4));
    this.wl(`| ${title} |`);
    this.wl('-'.repeat(title.length + 4));
    this.wl();

    if (typeof data === 'object') {
      this.printObj(data);
    } else {
      this.wl(data);
    }

    this.wl();
  }

  private printObj(data: object, indent = 0, itemInd?: number) {
    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        if (typeof item === 'object' && item != null) {
          this.printObj(item, indent, i + 1);
        } else {
          this.wl(`${' '.repeat(indent)}${i + 1}. ${item ?? ''}`);
        }
      });

      return;
    }

    Object.keys(data).forEach((key, i) => {
      let prefix = ' '.repeat(indent);

      if (itemInd != null) {
        if (i === 0) {
          prefix += `${itemInd}. `;
        } else {
          prefix += '   ';
        }
      }

      const value = data[key] as unknown;

      if (typeof value === 'object' && value != null) {
        this.wl(`${prefix}${key}:`);
        this.printObj(value, indent + (itemInd != null ? 5 : 2));
      } else {
        this.wl(`${prefix}${key}: ${value ?? ''}`);
      }
    });
  }

  wl(line = '') {
    this.str += `${line}\n`;
  }

  toString() {
    return this.str;
  }
}

/**
 * Responsible for generating a diagnostic report that can be used
 * to diagnose issues such as common misconfigurations. This report
 * is only generated on-demand (generally while receiving tech support)
 * and is never collected or generated automatically.
 */
@InitAfter('StreamingService')
export class DiagnosticsService extends PersistentStatefulService<IDiagnosticsServiceState> {
  @Inject() settingsService: SettingsService;
  @Inject() outputSettingsService: OutputSettingsService;
  @Inject() hardwareService: HardwareService;
  @Inject() scenesService: ScenesService;
  @Inject() userService: UserService;
  @Inject() sourceFiltersService: SourceFiltersService;
  @Inject() streamingService: StreamingService;
  @Inject() performanceService: PerformanceService;
  @Inject() cacheUploaderService: CacheUploaderService;
  @Inject() audioService: AudioService;
  @Inject() sourcesService: SourcesService;
  @Inject() videoEncodingOptimizationService: VideoEncodingOptimizationService;
  @Inject() transitionsService: TransitionsService;
  @Inject() recordingModeService: RecordingModeService;
  @Inject() appService: AppService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() streamSettingsService: StreamSettingsService;
  @Inject() videoService: VideoService;

  get cacheDir() {
    return this.appService.appDataDirectory;
  }

  get hasRecentlyStreamed(): boolean {
    return this.state.streams.length > 0;
  }

  get isFrequentUser(): boolean {
    // At least 5 streams in the last 30 days
    const numStreams = this.state.streams.reduce((num: number, stream: IStreamDiagnosticInfo) => {
      const streamDate = new Date(stream.endTime);
      const today = new Date(Date.now());
      const numDaysSinceStream = Math.floor(
        (today.getTime() - streamDate.getTime()) / (1000 * 3600 * 24),
      );

      if (numDaysSinceStream >= 30) {
        num = num + 1;
        return num;
      }
    }, 0);

    return numStreams > 4;
  }

  static defaultState: IDiagnosticsServiceState = {
    streams: [],
  };

  problems: string[];

  accumulators: {
    skipped?: Accumulator;
    lagged?: Accumulator;
    dropped?: Accumulator;
    fps?: Accumulator;
    cpu?: Accumulator;
  } = {};

  streaming = false;

  init() {
    super.init();

    this.streamingService.streamingStatusChange.subscribe(state => {
      if (state === EStreamingState.Live) {
        if (this.streaming) return;

        this.streaming = true;

        const { platforms, destinations, type } = this.formatStreamInfo();

        this.ADD_STREAM({
          startTime: Date.now(),
          platforms,
          destinations,
          type,
        });

        this.accumulators.skipped = new Accumulator();
        this.accumulators.lagged = new Accumulator();
        this.accumulators.dropped = new Accumulator();
        this.accumulators.fps = new Accumulator();
        this.accumulators.cpu = new Accumulator();
      }

      if (state === EStreamingState.Offline) {
        this.saveAccumulators();
        this.UPDATE_STREAM({ endTime: Date.now() });
        this.streaming = false;
        this.accumulators = {};
      }
    });

    this.performanceService.statisticsUpdated.subscribe(stats => {
      if (!this.streaming) return;

      this.accumulators.skipped.sample(stats.percentageSkippedFrames);
      this.accumulators.lagged.sample(stats.percentageLaggedFrames);
      this.accumulators.dropped.sample(stats.percentageDroppedFrames);
      this.accumulators.cpu.sample(stats.CPU);
      this.accumulators.fps.sample(stats.frameRate);
    });

    this.streamingService.streamErrorCreated.subscribe((error: string) => {
      const { platforms, destinations, type } = this.formatStreamInfo();
      this.UPDATE_STREAM({ error, platforms, destinations, type });
    });

    setInterval(() => {
      // Flush stats to persistent storage every 60 seconds.
      // This means we have relatively up to date stats even in
      // the event of a crash.
      this.saveAccumulators();
    }, STATS_FLUSH_INTERVAL);
  }

  private saveAccumulators() {
    if (!this.streaming) return;

    this.UPDATE_STREAM({
      pctSkipped: this.accumulators.skipped.lastValue,
      pctLagged: this.accumulators.lagged.lastValue,
      pctDropped: this.accumulators.dropped.lastValue,
      avgFps: this.accumulators.fps.average,
      avgCpu: this.accumulators.cpu.average,
    });
  }

  async generateReport() {
    this.problems = [];
    const top = await this.generateTopSection();
    const user = this.generateUserSection();
    const system = this.generateSystemSection();
    const config = this.generateConfigurationSection();
    const video = this.generateVideoSection();
    const output = this.generateOutputSection();
    const audio = this.generateAudioSection();
    const devices = this.generateDevicesSection();
    const scenes = this.generateScenesSection();
    const transitions = this.generateTransitionsSection();
    const streams = this.generateStreamsSection();
    const network = this.generateNetworkSection();
    const crashes = this.generateCrashesSection();
    const dualOutput = this.generateDualOutputSection();

    // Problems section needs to be generated last, because it relies on the
    // problems array that all other sections add to.
    const problems = this.generateProblemsSection();

    const report = [
      top,
      problems,
      user,
      system,
      config,
      streams,
      crashes,
      video,
      output,
      network,
      audio,
      devices,
      dualOutput,
      scenes,
      transitions,
    ];

    return report.join('');
  }

  async uploadReport() {
    const formData = new FormData();
    formData.append('content', await this.generateReport());

    return jfetch<{ success: boolean; report_code: string }>(
      'https://streamlabs.com/api/v6/desktop/reports',
      {
        method: 'POST',
        body: formData,
      },
    );
  }

  private logProblem(problem: string) {
    this.problems.push(problem);
  }

  private formatTargets(arr: TPlatform[] | string[]) {
    if (!arr.length) return 'None';
    return JSON.stringify(arr).slice(1, -1);
  }

  /**
   * Confirm the platforms array contains the names of the platforms
   * @remark If the item in a platforms array is a number, it's the index of the platform name
   * when the platforms object is made iterable. Convert the index to the platform name
   * for readability.
   * @param platforms The platforms array to validate
   * @returns Array of platform names
   */
  private validatePlatforms(platforms: string) {
    const platformNames = platforms.replace(/"/g, '').split(',');
    if (!platformNames.length) {
      return 'None';
    }

    const names = platformNames.map(platform => {
      if (/^\d+$/.test(platform)) {
        const index = parseInt(platform, 10);
        return platformList[index];
      }
      return platform;
    });

    return JSON.stringify(names).slice(1, -1);
  }

  private formatSimpleOutputInfo() {
    const settings = this.outputSettingsService.getSettings();
    const values = this.settingsService.views.values.Output;

    return {
      Mode: settings.mode,
      Streaming: {
        'Video Bitrate': settings.streaming.bitrate,
        Encoder:
          settings.streaming.encoder === EEncoderFamily.jim_nvenc
            ? 'NVENC (New)'
            : settings.streaming.encoder,
        'Audio Bitrate': values.ABitrate,
        'Enable Advanced Encoder Settings': values.UseAdvanced,
        'Advanced Encoder Settings': {
          'Enforce Streaming Service Bitrate Limits': values.EnforceBitrate,
          'Encoder Preset': settings.streaming.preset,
          'Custom Encoder Settings': values.x264Settings,
        },
      },
      Recording: {
        'Recording Path': values.RecFilePath,
        'Generate File Name without Space': values.FileNameWithoutSpace,
        'Recording Quality': values.RecQuality,
        'Recording Format': values.RecFormat,
        'Audio Encoder': values.RecAEncoder,
        'Custom Muxer Settings': values.MuxerCustom,
      },
      ReplayBuffer: {
        'Enable Replay Buffer': values.RecRB,
        'Maximum Replay Time (Seconds)': values.RecRBTime,
      },
    };
  }

  private formatAdvancedOutputInfo() {
    const settings = this.outputSettingsService.getSettings();
    const values = this.settingsService.views.values.Output;

    return {
      Mode: settings.mode,
      Streaming: {
        'Audio Track': this.settingsService.views.streamTrack + 1,
        Encoder:
          settings.streaming.encoder === EEncoderFamily.jim_nvenc
            ? 'NVENC (New)'
            : settings.streaming.encoder,
        'Enforce Streaming Service Encoder Settings': values.ApplyServiceSettings,
        'Rescale Output': settings.streaming.rescaleOutput,
        'Rate Control': settings.streaming.rateControl,
        Bitrate: settings.streaming.bitrate,
        'Use Custom Buffer Size': values.use_bufsize,
        'Buffer Size': values.buffer_size,
        'Keyframe Interval': values.keyint_sec,
        'CPU Usage Preset': values.preset,
        Profile: values.profile,
        Tune: values.tune,
        'x264 Options': values.x264opts,
        Other: {
          'Use Custom Resolution': settings.streaming.hasCustomResolution,
          'Output Resolution': settings.streaming.outputResolution,
          'Encoder Preset': settings.streaming.preset,
          'Encoder Options': settings.streaming.encoderOptions,
          'VOD Track': this.settingsService.views.vodTrack + 1,
          'VOD Track Enabled': !!this.settingsService.views.vodTrackEnabled,
        },
      },
      Recording: {
        Type: values.RecType,
        'Recording Path': values.RecFilePath,
        'Generate File Name without Space': values.FileNameWithoutSpace,
        'Recording Format': values.RecFormat,
        'Audio Track': values.RecTracks,
        'Video Encoder': values.RecEncoder,
        'Audio Encoder': values.RecAEncoder,
        'Rescale Output': values.RecRescale,
        'Custom Muxer Settings': values.MuxerCustom,
        'Automatic File Splitting': values.RecSplitFile,
        'File Splitting Settings': {
          'Split By': values.RecSplitFileType,
          'Split Time in Minutes': values.RecSplitFileTime,
          'Reset Timestamps at the Beginning of Each Split File':
            values.RecSplitFileResetTimestamps,
        },
        Other: {
          'Using Stream Encoder': settings.recording.isSameAsStream,
          Encoder:
            settings.recording.encoder === EEncoderFamily.jim_nvenc
              ? 'NVENC (New)'
              : settings.recording.encoder,
          'Rate Control': settings.recording.rateControl,
          Bitrate: settings.recording.bitrate,
          'Output Resolution': settings.recording.outputResolution,
          'Audio Tracks': this.settingsService.views.recordingTracks.map(t => t + 1).join(', '),
        },
      },
      Audio: {
        'Track 1 - Audio Bitrate': values.Track1Bitrate,
        'Track 1 - Audio Name': values.Track1Name,
        'Track 2 - Audio Bitrate': values.Track2Bitrate,
        'Track 2 - Audio Name': values.Track2Name,
        'Track 3 - Audio Bitrate': values.Track3Bitrate,
        'Track 3 - Audio Name': values.Track3Name,
        'Track 4 - Audio Bitrate': values.Track4Bitrate,
        'Track 4 - Audio Name': values.Track4Name,
        'Track 5 - Audio Bitrate': values.Track5Bitrate,
        'Track 5 - Audio Name': values.Track5Name,
        'Track 6 - Audio Bitrate': values.Track6Bitrate,
        'Track 6 - Audio Name': values.Track6Name,
      },
      ReplayBuffer: {
        'Enable Replay Buffer': values.RecRB,
        'Maximum Replay Time (Seconds)': values.RecRBTime,
      },
      'Use Optimizaed Encoder Settings': this.videoEncodingOptimizationService.state
        .useOptimizedProfile,
    };
  }

  private formatStreamInfo() {
    const targets = this.dualOutputService.views.getEnabledTargets();

    const platformList = targets.platforms.horizontal.concat(targets.platforms.vertical);
    const destinationList = targets.destinations.horizontal.concat(targets.destinations.vertical);

    const platforms = this.formatTargets(platformList);
    const destinations = this.formatTargets(destinationList);

    const info = {
      platforms,
      destinations,
      type: 'Single Output',
    };

    if (this.dualOutputService.views.dualOutputMode) {
      return {
        ...info,
        type: 'Dual Output',
      };
    }

    if (platformList.length + destinationList.length > 1) {
      return {
        ...info,
        type: 'Multistream',
      };
    }

    return info;
  }

  private async generateTopSection() {
    // All diagnostic reports include a cache upload
    const cacheId = await this.cacheUploaderService.uploadCache();

    return new Section('Streamlabs Desktop Diagnostic Report', {
      Version: Utils.env.SLOBS_VERSION,
      Bundle: SLOBS_BUNDLE_ID,
      Date: new Date().toString(),
      Cache: cacheId,
    });
  }

  private generateUserSection() {
    const title = 'User';

    if (this.userService.views.isLoggedIn) {
      return new Section(title, {
        'User Id': this.userService.state.userId,
        'Logged-In Platform': {
          Username: this.userService.views.platform.username,
          Platform: this.userService.views.platform.type,
        },
        'Connected Platforms': Object.keys(this.userService.views.platforms).map(p => {
          return {
            Username: this.userService.views.platforms[p].username,
            Platform: p,
          };
        }),
      });
    } else {
      return new Section(title, 'User is not logged in');
    }
  }

  private generateConfigurationSection() {
    return new Section('Configuration', {
      'Recording Mode': this.recordingModeService.state.enabled,
    });
  }

  private generateVideoSection() {
    const isDualOutputMode = this.dualOutputService.views.dualOutputMode;
    const displays: TDisplayType[] = isDualOutputMode ? ['horizontal'] : ['horizontal', 'vertical'];

    let settings = {} as { horizontal: {}; vertical: {} };

    // get settings for all active displays
    displays.forEach((display: TDisplayType) => {
      const setting = this.videoService.formatVideoSettings(display, true);
      const maxHeight = display === 'horizontal' ? 1080 : 1280;
      const minHeight = 720;

      if (!setting) return;

      const outputRes = this.videoService.outputResolutions[display];
      const outputAspect = outputRes.outputWidth / outputRes.outputHeight;

      if (outputAspect < 16 / 9.1 || outputAspect > 16 / 8.9) {
        this.logProblem(`Output resolution is not 16:9 aspect ratio: ${setting.outputRes}`);
      }

      const fpsObj = { Type: setting.fpsType.toString() };

      if (fpsObj.Type === 'Common FPS Values') {
        fpsObj['Value'] = setting.fpsCom;
      } else if (fpsObj.Type === 'Integer FPS Value') {
        fpsObj['Value'] = setting.fpsInt;
      } else if (fpsObj.Type === 'Fractional FPS Value') {
        fpsObj['Numerator'] = setting.fpsNum;
        fpsObj['Denominator'] = setting.fpsDen;
      }

      const baseRes = this.videoService.baseResolutions[display];
      const baseAspect = baseRes.baseWidth / baseRes.baseHeight;

      if (baseAspect < 16 / 9.1 || baseAspect > 16 / 8.9) {
        this.logProblem(`Base resolution is not 16:9 aspect ratio: ${setting.baseRes}`);
      }

      if (baseAspect !== outputAspect) {
        this.logProblem('Base resolution and Output resolution have different aspect ratio');
      }

      if (outputRes.outputHeight > baseRes.baseHeight) {
        this.logProblem('Output resolution is higher than Base resolution (upscaling)');
      }

      if (outputRes.outputHeight < minHeight) {
        this.logProblem(`Low Output resolution: ${setting.outputRes}`);
      }

      if (outputRes.outputHeight > maxHeight) {
        this.logProblem(`High Output resolution: ${setting.outputRes}`);
      }

      if (baseRes.baseHeight < minHeight) {
        this.logProblem(`Low Base resolution: ${setting.baseRes}`);
      }

      settings = {
        ...settings,
        [display]: {
          'Base Resolution': setting.baseRes,
          'Output Resolution': setting.outputRes,
          'Downscale Filter': setting.scaleType,
          'Frame Rate': fpsObj,
        },
      };
    });

    return new Section('Video', {
      'Single Output': settings.horizontal,
      'Dual Output Horizontal': settings.horizontal,
      'Dual Output Vertical': settings.vertical ?? 'None',
    });
  }

  private generateOutputSection() {
    const settings = this.outputSettingsService.getSettings();

    if (settings.streaming.bitrate < 2500) {
      this.logProblem(`Low streaming bitrate: ${settings.streaming.bitrate}`);
    }

    if (settings.recording.bitrate < 2500) {
      this.logProblem(`Low recording bitrate: ${settings.recording.bitrate}`);
    }

    const outputInfo =
      settings.mode === 'Simple' ? this.formatSimpleOutputInfo() : this.formatAdvancedOutputInfo();

    return new Section('Output', outputInfo);
  }

  private generateSystemSection() {
    const cpus = os.cpus();
    let gpuSection: Object;
    let isAdmin: string | boolean = 'N/A';

    if (getOS() === OS.Windows) {
      const gpuInfo = this.getWmiClass('Win32_VideoController', [
        'Name',
        'DriverVersion',
        'DriverDate',
      ]);

      gpuSection = {};

      // Ensures we are working with an array
      [].concat(gpuInfo).forEach((gpu, index) => {
        gpuSection[`GPU ${index + 1}`] = {
          Name: gpu.Name,
          'Driver Version': gpu.DriverVersion,
          'Driver Date': gpu.DriverDate,
        };
      });

      isAdmin = this.isRunningAsAdmin();

      if (!isAdmin) this.logProblem('Not running as admin');
    }

    return new Section('System', {
      'Operating System': `${os.platform()} ${os.release()}`,
      Architecture: process.arch,
      CPU: {
        Model: cpus[0].model,
        Cores: cpus.length,
      },
      Memory: {
        Total: prettyBytes(os.totalmem()),
        Free: prettyBytes(os.freemem()),
      },
      Graphics: gpuSection ?? 'This information is not available on macOS reports',
      'Running as Admin': isAdmin,
      Monitors: remote.screen.getAllDisplays().map(display => {
        return {
          Resolution: `${display.size.width}x${display.size.height}`,
          Scaling: display.scaleFactor,
          Refresh: display.displayFrequency,
          Internal: display.internal,
          Rotation: display.rotation,
        };
      }),
    });
  }

  private generateNetworkSection() {
    const settings = this.settingsService.views.values;

    return new Section('Network', {
      'Bind to IP': settings.Advanced.BindIP,
      'Bind to IP Options': this.settingsService
        .findSetting(this.settingsService.state.Advanced.formData, 'Network', 'BindIP')
        .options.map((opt: any) => opt.description),
      'Dynamic Bitrate': settings.Advanced.DynamicBitrate,
      'New Networking Code': settings.Advanced.NewSocketLoopEnable,
      'Low Latency Mode': settings.Advanced.LowLatencyEnable,
    });
  }

  private generateCrashesSection() {
    // Here we read and parse 'crash-handler' file and parse it to extract information about crashes
    // As the files' size in total is < 2 MB, it is not resource-intensive operation.
    // Furthermore, the code is optimized to parse last N entries only.
    const MAX_CRASHES_COUNT = 5;

    const parseDate = (rawDate: string, rawTime: string): Date => {
      const year = +rawDate.substring(0, 4);
      const month = +rawDate.substring(4, 6) - 1; // -1 is used to convert it into month index
      const day = +rawDate.substring(6, 8);

      const hour = +rawTime.substring(0, 2);
      const minute = +rawTime.substring(2, 4);

      return new Date(year, month, day, hour, minute);
    };

    const sectionItems: Array<{ Time: string; Module?: string; Path?: string }> = [];

    const parseCrashLog = (fileName: string): void => {
      const fullPath = path.join(this.cacheDir, fileName);
      if (!fs.existsSync(fullPath)) {
        return;
      }

      const fileContents = fs.readFileSync(fullPath, 'utf8');

      const crashEntries: Array<any> = [];
      const lines = fileContents.split('\n');

      // Going backwards to fetch the latest entries first
      for (let i = lines.length - 1; i >= 0; --i) {
        const line = lines[i];

        // There can be crashes with and without crash info, so using 2 distinct matches to process them
        if (line.match(/crashed_module_info/)) {
          const [, infoBlock] = line.split(': ');

          let [, module] = infoBlock.split(' ');
          module = module.trim();
          const pathStartIndex = infoBlock.indexOf('(');
          const pathEndIndex = infoBlock.indexOf(')');
          let path = null;
          if (pathStartIndex !== -1 && pathEndIndex !== -1) {
            // +1 is to skip the leading '(' symbol
            path = infoBlock.substring(pathStartIndex + 1, pathEndIndex);
          }

          // As we are parsing backwards and this message comes after the 'process died', we can just update the last record
          Object.assign(crashEntries[crashEntries.length - 1], { module, path });
        } else if (line.match(/process died/)) {
          const [, , date, time] = line.split(':');
          crashEntries.push({ timestamp: parseDate(date, time) });
        }

        if (crashEntries.length >= MAX_CRASHES_COUNT) {
          break;
        }
      }

      for (const entry of crashEntries) {
        const data = { Time: entry.timestamp.toString() };

        if (entry.module) {
          data['Module'] =
            entry.module +
            ' (' +
            (entry.path && entry.path.length !== 0 ? entry.path : 'unknown path') +
            ')';
        } else {
          data['Module'] = '(no data)';
        }

        sectionItems.push(data);

        if (sectionItems.length >= MAX_CRASHES_COUNT) {
          break;
        }
      }
    };

    // There is a log rotation feature for crash-handler logs, so it no entries were found in the current log,
    // we are trying the old one, because it might just be recently rotated.
    parseCrashLog('crash-handler.log');
    if (sectionItems.length < MAX_CRASHES_COUNT) {
      parseCrashLog('crash-handler.log.old');
    }

    return new Section('Crashes', sectionItems);
  }

  private generateAudioSection() {
    const settings = this.settingsService.views.values;
    const devices = this.hardwareService.devices;

    function audioDeviceObj(deviceId: string) {
      if (deviceId == null) return {};

      const deviceObj = devices.find(device => deviceId === device.id);

      return {
        Id: deviceId,
        Name: deviceObj ? deviceObj.description : '<DEVICE NOT FOUND>',
      };
    }

    const globalSources = {};

    [1, 2, 3, 4, 5].forEach(channel => {
      const source = this.sourcesService.views.getSourceByChannel(channel);
      const name = ['', 'Desktop Audio', 'Desktop Audio 2', 'Mic/Aux', 'Mic/Aux 2', 'Mix/Aux 3'][
        channel
      ];

      if (source) {
        globalSources[name] = {
          ...audioDeviceObj(settings.Audio[name] as string),
          ...this.generateSourceData(source),
        };
      } else {
        globalSources[name] = 'Disabled';
      }
    });

    return new Section('Audio', {
      'Sample Rate': settings.Audio.SampleRate,
      Channels: settings.Audio.ChannelSetup,
      'Global Sources': globalSources,
      'Monitoring Device': settings.Advanced.MonitoringDeviceName,
    });
  }

  private generateDevicesSection() {
    const devices = this.hardwareService.devices;
    const dshowDevices = this.hardwareService.dshowDevices;

    function mapDevice(d: IDevice) {
      return {
        Name: d.description,
        Id: d.id,
      };
    }

    return new Section('Available Devices', {
      Audio: {
        Output: devices.filter(d => d.type === EDeviceType.audioOutput).map(mapDevice),
        Input: devices.filter(d => d.type === EDeviceType.audioInput).map(mapDevice),
      },
      'Video Capture': dshowDevices.map(mapDevice),
    });
  }

  private generateTransitionsSection() {
    return new Section('Transitions', {
      Transitions: this.transitionsService.state.transitions.map(transition => {
        return {
          ID: transition.id,
          Name: transition.name,
          'Is Default': transition.id === this.transitionsService.state.defaultTransitionId,
          Type: transition.type,
          Duration: transition.duration,
          Settings: this.transitionsService.getSettings(transition.id),
        };
      }),
      Connections: this.transitionsService.state.connections.map(connection => {
        return {
          'From Scene ID': connection.fromSceneId,
          'To Scene ID': connection.toSceneId,
          'Transition ID': connection.transitionId,
        };
      }),
    });
  }

  private generateScenesSection() {
    const sceneData = {};

    this.scenesService.views.scenes.map(s => {
      sceneData[s.name] = s.getItems().map(si => {
        return this.generateSourceData(si.getSource(), si);
      });
    });

    return new Section('Scenes', {
      'Active Scene': this.scenesService.views.activeScene.name,
      Scenes: sceneData,
    });
  }

  private generateSourceData(source: Source, sceneItem?: SceneItem) {
    // Non-translated plain names for widget types
    const widgetLookup = [
      'AlertBox',
      'DonationGoal',
      'FollowerGoal',
      'SubscriberGoal',
      'BitGoal',
      'DonationTicker',
      'ChatBox',
      'EventList',
      'TipJar',
      'ViewerCount',
      'StreamBoss',
      'Credits',
      'SpinWheel',
      'SponsorBanner',
      'MediaShare',
      'SubGoal',
      'StarsGoal',
      'SupporterGoal',
      'CharityGoal',
      'Poll',
      'EmoteWall',
      'ChatHighlight',
      'CustomWidget',
    ];

    const propertiesManagerType = source.getPropertiesManagerType();
    const propertiesManagerSettings = source.getPropertiesManagerSettings();

    let sourceData = {
      Name: source.name,
      Type: source.type,
    };

    if (propertiesManagerType === 'widget') {
      sourceData['Widget Type'] = widgetLookup[propertiesManagerSettings.widgetType];
    } else if (propertiesManagerType === 'streamlabels') {
      sourceData['Streamlabel Type'] = propertiesManagerSettings.statname;
    }

    // TODO: Handle macOS
    if (source.type === 'dshow_input') {
      const deviceId = source.getObsInput().settings['video_device_id'];
      const device = this.hardwareService.dshowDevices.find(d => d.id === deviceId);

      if (device == null) {
        this.logProblem(
          `Source ${source.name} references device ${deviceId} which could not be found on the system.`,
        );
      }

      sourceData['Selected Device Id'] = deviceId;
      sourceData['Selected Device Name'] = device?.description ?? '<DEVICE NOT FOUND>';
    }

    if (source.audio) {
      sourceData = { ...sourceData, ...this.generateAudioSourceData(source.sourceId) };
    }

    if (sceneItem) {
      sourceData['Visible'] = sceneItem.visible;
    }

    sourceData['Filters'] = this.sourceFiltersService.views
      .filtersBySourceId(source.sourceId)
      .map(f => {
        return {
          Name: f.name,
          Type: f.type,
          Enabled: f.visible,

          // TODO: Decide if settings are needed - it adds a lot of noise
          // Settings: f.settings,
        };
      });

    return sourceData;
  }

  private generateAudioSourceData(sourceId: string) {
    const sourceData = {};
    const audioSource = this.audioService.views.getSource(sourceId);

    if (this.settingsService.state.Output.type === 1) {
      const tracks = Utils.numberToBinnaryArray(audioSource.audioMixers, 6).reverse();
      const enabledTracks = tracks.reduce((arr, val, idx) => {
        if (val) {
          return [...arr, idx + 1];
        }

        return arr;
      }, []);

      sourceData['Enabled Audio Tracks'] = enabledTracks.join(', ');
    }

    sourceData['Muted'] = audioSource.muted;
    sourceData['Volume'] = audioSource.fader.deflection * 100;
    sourceData['Monitoring'] = ['Monitor Off', 'Monitor Only (mute output)', 'Monitor and Output'][
      audioSource.monitoringType
    ];
    sourceData['Sync Offset'] = audioSource.syncOffset;

    return sourceData;
  }

  private generateStreamsSection() {
    return new Section(
      'Streams',
      this.state.streams.map(s => {
        const platforms = this.validatePlatforms(s?.platforms);

        if (
          s?.type === 'Single Output' &&
          platforms.includes('tiktok') &&
          s?.error.split(' ').at(-1) === '422'
        ) {
          this.logProblem(
            'TikTok user might be blocked from streaming. Refer them to TikTok producer page or support to confirm live access status',
          );
        }

        return {
          'Start Time': new Date(s.startTime).toString(),
          'End Time': s.endTime ? new Date(s.endTime).toString() : 'Stream did not end cleanly',
          'Skipped Frames': `${s.pctSkipped?.toFixed(2)}%`,
          'Lagged Frames': `${s.pctLagged?.toFixed(2)}%`,
          'Dropped Frames': `${s.pctDropped?.toFixed(2)}%`,
          'Average CPU': `${s.avgCpu?.toFixed(2)}%`,
          'Average FPS': s.avgFps?.toFixed(2),
          'Stream Error': s?.error ?? 'None',
          Platforms: platforms,
          Destinations: s?.destinations,
          'Stream Type': s?.type,
        };
      }),
    );
  }

  private generateDualOutputSection() {
    const { platforms, destinations } = this.dualOutputService.views.getEnabledTargets('name');
    const restreamHorizontal =
      platforms.horizontal.length + destinations.horizontal.length > 1 ? 'Yes' : 'No';
    const restreamVertical =
      platforms.vertical.length + destinations.vertical.length > 1 ? 'Yes' : 'No';

    const numHorizontal = this.dualOutputService.views.horizontalNodeIds?.length;
    const numVertical = this.dualOutputService.views.verticalNodeIds?.length;

    if (numHorizontal !== numVertical) {
      this.logProblem(
        'Active collection has a different number of horizontal and vertical sources.',
      );
    }

    return new Section('Dual Output', {
      'Dual Output Active': this.dualOutputService.views.dualOutputMode,
      'Dual Output Scene Collection Active': this.dualOutputService.views.hasNodeMap(),
      Sources: {
        'Number Horizontal Sources': numHorizontal,
        'Number Vertical Sources': numVertical,
      },
      Targets: {
        'Horizontal Platforms': this.formatTargets(platforms.horizontal),
        'Vertical Platforms': this.formatTargets(platforms.vertical),
        'Horizontal Custom Destinations': this.formatTargets(destinations.horizontal),
        'Vertical Custom Destinations': this.formatTargets(destinations.vertical),
      },
      'Horizontal Uses Multistream': restreamHorizontal,
      'Vertical Uses Multistream': restreamVertical,
    });
  }

  private generateProblemsSection() {
    return new Section(
      'Potential Issues',
      this.problems.length ? this.problems : 'No issues detected',
    );
  }

  private getWmiClass(wmiClass: string, select: string[]): object {
    try {
      const result = JSON.parse(
        cp
          .execSync(
            `Powershell -command "Get-CimInstance -ClassName ${wmiClass} | Select-Object ${select.join(
              ', ',
            )} | ConvertTo-JSON"`,
          )
          .toString(),
      );

      if (Array.isArray(result)) {
        return result.map(o => this.convertWmiValues(o));
      } else {
        return this.convertWmiValues(result);
      }
    } catch (e: unknown) {
      console.error(`Error fetching WMI class ${wmiClass} for diagnostics`, e);
      return [];
    }
  }

  private convertWmiValues(wmiObject: object) {
    Object.keys(wmiObject).forEach(key => {
      const val = wmiObject[key];

      if (typeof val === 'string') {
        const match = val.match(/\/Date\((\d+)\)/);

        if (match) {
          wmiObject[key] = new Date(parseInt(match[1], 10)).toString();
        }
      }
    });

    return wmiObject;
  }

  private isRunningAsAdmin() {
    try {
      cp.execSync('net session > nul 2>&1');
      return true;
    } catch (e: unknown) {
      return false;
    }
  }

  @mutation({ sync: false })
  private ADD_STREAM(stream: IStreamDiagnosticInfo) {
    this.state.streams.unshift(stream);
    if (this.state.streams.length > STREAM_HISTORY_LENGTH) this.state.streams.pop();
  }

  @mutation({ sync: false })
  private UPDATE_STREAM(stream: Partial<IStreamDiagnosticInfo>) {
    Vue.set(this.state.streams, 0, { ...this.state.streams[0], ...stream });
  }
}
