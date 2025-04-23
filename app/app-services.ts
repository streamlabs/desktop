/**
 * All services must be registered in this file
 */

// OFFLINE SERVICES
export { AppService } from 'services/app';
export { InternalApiService } from 'services/api/internal-api';
export { ExternalApiService } from 'services/api/external-api';
export { ExternalApiLimitsService } from 'services/api/external-api-limits';
export { SourcesService, Source } from 'services/sources';
export { Scene, SceneItem, SceneItemFolder, ScenesService } from 'services/scenes';
export { ObsImporterService } from 'services/obs-importer';
export { TwitchStudioImporterService } from 'services/ts-importer';
export { ClipboardService } from 'services/clipboard';
export { AudioService, AudioSource } from 'services/audio';
export { HostsService, UrlService } from 'services/hosts';
export { Hotkey, HotkeysService } from 'services/hotkeys';
export { KeyListenerService } from 'services/key-listener';
export { ShortcutsService } from 'services/shortcuts';
export { CustomizationService } from 'services/customization';
export { LayoutService } from 'services/layout';
export { NotificationsService } from 'services/notifications';
export { OnboardingService } from 'services/onboarding';
export { NavigationService } from 'services/navigation';
export { PerformanceService } from 'services/performance';
export { SettingsService, OutputSettingsService } from 'services/settings';
export { VideoService } from 'services/video';
export { WindowsService } from 'services/windows';
export { TransitionsService } from 'services/transitions';
export { FontLibraryService } from 'services/font-library';
export { SourceFiltersService } from 'services/source-filters';
export { CacheUploaderService } from 'services/cache-uploader';
export { TcpServerService } from 'services/api/tcp-server';
export { IpcServerService } from 'services/api/ipc-server';
export { JsonrpcService } from 'services/api/jsonrpc';
export { DismissablesService } from 'services/dismissables';
export { SceneCollectionsServerApiService } from 'services/scene-collections/server-api';
export { SceneCollectionsService } from 'services/scene-collections';
export { TroubleshooterService } from 'services/troubleshooter';
export { GlobalSelection, Selection, SelectionService } from 'services/selection';
export { OverlaysPersistenceService } from 'services/scene-collections/overlays';
export { SceneCollectionsStateService } from 'services/scene-collections/state';
export { FileManagerService } from 'services/file-manager';
export { ProtocolLinksService } from 'services/protocol-links';
export { ProjectorService } from 'services/projector';
export { I18nService } from 'services/i18n';
export { ObsUserPluginsService } from 'services/obs-user-plugins';
export { HardwareService, DefaultHardwareService } from 'services/hardware';
export { EditorCommandsService } from 'services/editor-commands';
export { EditorService } from 'services/editor';
export { StreamSettingsService } from 'services/settings/streaming';
export { TouchBarService } from 'services/touch-bar';
export { ApplicationMenuService } from 'services/application-menu';
export { MacPermissionsService } from 'services/mac-permissions';
export { VirtualWebcamService } from 'services/virtual-webcam';
export { MetricsService } from 'services/metrics';
export { HighlighterService } from 'services/highlighter';
export { DiagnosticsService } from 'services/diagnostics';
export { RecordingModeService } from 'services/recording-mode';
export { SideNavService } from 'services/side-nav';
export { VideoSettingsService } from 'services/settings-v2/video';
export { SettingsManagerService } from 'services/settings-manager';
export { MarkersService } from 'services/markers';
export { RealmService } from 'services/realm';
import { VirtualWebcamService } from 'services/virtual-webcam';

// ONLINE SERVICES
export { UserService } from './services/user';
export { YoutubeService } from 'services/platforms/youtube';
export { TwitchService } from 'services/platforms/twitch';
export {
  TwitchTagsService,
  TwitchContentClassificationService,
} from 'services/platforms/twitch/index';
export { FacebookService } from 'services/platforms/facebook';
export { TikTokService } from 'services/platforms/tiktok';
export { TrovoService } from 'services/platforms/trovo';
export { KickService } from 'services/platforms/kick';
export { RestreamService } from 'services/restream';
export { TwitterService } from 'services/integrations/twitter';
export { TwitterPlatformService } from 'services/platforms/twitter';
export { InstagramService } from 'services/platforms/instagram';
export { UsageStatisticsService } from './services/usage-statistics';
export { GameOverlayService } from 'services/game-overlay';
export { SharedStorageService } from 'services/integrations/shared-storage';
export { RemoteControlService } from 'services/api/remote-control-api';

export { MediaGalleryService } from 'services/media-gallery';
export { MediaBackupService } from 'services/media-backup';
export { OutageNotificationsService } from 'services/outage-notifications';
export { AnnouncementsService } from 'services/announcements';
export { WebsocketService } from 'services/websocket';
export { IncrementalRolloutService } from 'services/incremental-rollout';
export { CrashReporterService } from 'services/crash-reporter';
export { PatchNotesService } from 'services/patch-notes';
export { VideoEncodingOptimizationService } from 'services/video-encoding-optimizations';
export { StreamingService } from 'services/streaming';
export { StreamlabelsService } from 'services/streamlabels';
export { AutoConfigService } from 'services/auto-config';
export { PlatformAppsService } from 'services/platform-apps';
export { PlatformAppStoreService } from 'services/platform-app-store';
export { PlatformAppAssetsService } from 'services/platform-apps/platform-app-assets-service';
export { ChatService } from 'services/chat';
export { RecentEventsService } from 'services/recent-events';
export { MagicLinkService } from 'services/magic-link';
export { GrowService } from 'services/grow/grow';
export { GuestCamService } from 'services/guest-cam';
export { DualOutputService } from 'services/dual-output';

// WIDGETS
export { WidgetSource, WidgetsService } from './services/widgets';
export { BitGoalService } from 'services/widgets/settings/bit-goal';
export { DonationGoalService } from 'services/widgets/settings/donation-goal';
export { FollowerGoalService } from 'services/widgets/settings/follower-goal';
export { StarsGoalService } from 'services/widgets/settings/stars-goal';
export { SupporterGoalService } from 'services/widgets/settings/supporter-goal';
export { SubscriberGoalService } from 'services/widgets/settings/subscriber-goal';
export { CharityGoalService } from 'services/widgets/settings/charity-goal';
export { StreamBossService } from 'services/widgets/settings/stream-boss';
export { DonationTickerService } from 'services/widgets/settings/donation-ticker';
export { CreditsService } from 'services/widgets/settings/credits';
export { EventListService } from 'services/widgets/settings/event-list';
export { TipJarService } from 'services/widgets/settings/tip-jar';
export { SponsorBannerService } from 'services/widgets/settings/sponsor-banner';
export { SubGoalService } from 'services/widgets/settings/sub-goal';
export { MediaShareService } from 'services/widgets/settings/media-share';
export { AlertBoxService } from 'services/widgets/settings/alert-box';
export { SpinWheelService } from 'services/widgets/settings/spin-wheel';
export { PollService } from 'services/widgets/settings/poll';
export { EmoteWallService } from 'services/widgets/settings/emote-wall';
export { ChatHighlightService } from 'services/widgets/settings/chat-highlight';
export { SuperchatGoalService } from 'services/widgets/settings/superchat-goal';

import { AppService } from './services/app';
import { WindowsService } from './services/windows';
import { CustomizationService } from './services/customization';
import { ScenesService } from './services/scenes';
import { EditorCommandsService } from './services/editor-commands';
import { EditorService } from 'services/editor';
import { PerformanceService } from './services/performance';
import { SourcesService } from './services/sources';
import { SelectionService } from './services/selection';
import { StreamingService } from './services/streaming';
import { StreamSettingsService } from './services/settings/streaming';
import { RestreamService } from './services/restream';
import { VideoEncodingOptimizationService } from './services/video-encoding-optimizations';
import { TwitterService } from './services/integrations/twitter';
import { SettingsService } from './services/settings';
import { UserService } from './services/user';
import { TwitchService } from './services/platforms/twitch';
import { TwitterPlatformService } from './services/platforms/twitter';
import {
  TwitchTagsService,
  TwitchContentClassificationService,
} from './services/platforms/twitch/index';
import { TrovoService } from './services/platforms/trovo';
import { YoutubeService } from './services/platforms/youtube';
import { FacebookService } from './services/platforms/facebook';
import { TikTokService } from './services/platforms/tiktok';
import { DismissablesService } from './services/dismissables';
import { NavigationService } from './services/navigation';
import { AnnouncementsService } from './services/announcements';
import { PatchNotesService } from './services/patch-notes';
import { VideoService } from './services/video';
import { ChatService } from './services/chat';
import { HighlighterService } from './services/highlighter';
import { GrowService } from './services/grow/grow';
import { TransitionsService } from './services/transitions';
import { TcpServerService } from './services/api/tcp-server';
import { MagicLinkService } from './services/magic-link';
import { UsageStatisticsService } from './services/usage-statistics';
import { NotificationsService } from './services/notifications';
import { MediaBackupService } from './services/media-backup';
import { HotkeysService } from './services/hotkeys';
import { WidgetsService } from './services/widgets';
import { HostsService } from './services/hosts';
import { OnboardingService } from './services/onboarding';
import { CacheUploaderService } from './services/cache-uploader';
import { StreamlabelsService } from './services/streamlabels';
import { SceneCollectionsService } from './services/scene-collections';
import { PlatformAppsService } from './services/platform-apps';
import { MediaGalleryService } from './services/media-gallery';
import { RecentEventsService } from 'services/recent-events';
import { AudioService } from './services/audio';
import { SourceFiltersService } from './services/source-filters';
import { DiagnosticsService } from './services/diagnostics';
import { WebsocketService } from './services/websocket';
import { SpinWheelService } from 'services/widgets/settings/spin-wheel';
import { LayoutService } from './services/layout';
import { ProjectorService } from './services/projector';
import { ObsImporterService } from 'services/obs-importer';
import { DefaultHardwareService, HardwareService } from 'services/hardware';
import { AutoConfigService } from 'services/auto-config';
import { MacPermissionsService } from 'services/mac-permissions';
import { IncrementalRolloutService } from './services/incremental-rollout';
import { RecordingModeService } from 'services/recording-mode';
import { JsonrpcService } from 'services/api/jsonrpc';
import { OverlaysPersistenceService } from 'services/scene-collections/overlays';
import { PlatformAppStoreService } from 'services/platform-app-store';
import { GameOverlayService } from 'services/game-overlay';
import { GuestCamService } from 'services/guest-cam';
import { SideNavService } from './services/side-nav';
import { VideoSettingsService } from 'services/settings-v2/video';
import { SettingsManagerService } from 'services/settings-manager';
import { DualOutputService } from 'services/dual-output';
import { MarkersService } from 'services/markers';
import { SharedStorageService } from 'services/integrations/shared-storage';
import { RealmService } from 'services/realm';
import { InstagramService } from 'services/platforms/instagram';
import { TwitchStudioImporterService } from 'services/ts-importer';
import { RemoteControlService } from 'services/api/remote-control-api';
import { UrlService } from 'services/hosts';
import { KickService } from 'services/platforms/kick';

export const AppServices = {
  AppService,
  WindowsService,
  ScenesService,
  RecentEventsService,
  NavigationService,
  AnnouncementsService,
  SettingsService,
  CustomizationService,
  EditorCommandsService,
  EditorService,
  PerformanceService,
  SourcesService,
  SelectionService,
  PatchNotesService,
  VideoService,
  ChatService,
  StreamingService,
  StreamSettingsService,
  RestreamService,
  VideoEncodingOptimizationService,
  TwitterService,
  YoutubeService,
  FacebookService,
  TikTokService,
  UserService,
  TwitchService,
  TwitterPlatformService,
  TwitchTagsService,
  TwitchContentClassificationService,
  TrovoService,
  KickService,
  InstagramService,
  DismissablesService,
  HighlighterService,
  GrowService,
  TransitionsService,
  TcpServerService,
  MagicLinkService,
  MediaGalleryService,
  UsageStatisticsService,
  NotificationsService,
  MediaBackupService,
  HotkeysService,
  WidgetsService,
  HostsService,
  OnboardingService,
  CacheUploaderService,
  StreamlabelsService,
  SceneCollectionsService,
  PlatformAppsService,
  AudioService,
  SourceFiltersService,
  DiagnosticsService,
  WebsocketService,
  SpinWheelService,
  LayoutService,
  ProjectorService,
  ObsImporterService,
  TwitchStudioImporterService,
  DefaultHardwareService,
  AutoConfigService,
  MacPermissionsService,
  IncrementalRolloutService,
  RecordingModeService,
  JsonrpcService,
  OverlaysPersistenceService,
  PlatformAppStoreService,
  GameOverlayService,
  GuestCamService,
  HardwareService,
  SideNavService,
  VideoSettingsService,
  SettingsManagerService,
  DualOutputService,
  MarkersService,
  SharedStorageService,
  RealmService,
  RemoteControlService,
  UrlService,
  VirtualWebcamService,
};
