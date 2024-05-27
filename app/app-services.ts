/**
 * All services must be registered in this file
 */

// OFFLINE SERVICES
export { AppService } from 'services/app';
export { InternalApiService } from 'services/api/internal-api';
export { ExternalApiService } from 'services/api/external-api';
export { SourcesService, Source } from 'services/sources';
export { Scene, SceneItem, SceneItemFolder, SceneItemNode, ScenesService } from 'services/scenes';
export { ObsImporterService } from 'services/obs-importer';
export { ClipboardService } from 'services/clipboard';
export { AudioService, AudioSource } from 'services/audio';
export { HostsService } from 'services/hosts';
export { Hotkey, HotkeysService } from 'services/hotkeys';
export { KeyListenerService } from 'services/key-listener';
export { ShortcutsService } from 'services/shortcuts';
export { CustomizationService } from 'services/customization';
export { NotificationsService } from 'services/notifications';
export { OnboardingService } from 'services/onboarding';
export { NavigationService } from 'services/navigation';
export { PerformanceService } from 'services/performance';
export { PerformanceMonitorService } from 'services/performance-monitor';
export { SettingsService, OutputSettingsService } from 'services/settings';
export { VideoService } from 'services/video';
export { WindowSizeService } from 'services/window-size';
export { WindowsService } from 'services/windows';
export { TransitionsService } from 'services/transitions';
export { FontLibraryService } from 'services/font-library';
export { SourceFiltersService } from 'services/source-filters';
export { TcpServerService } from 'services/api/tcp-server';
export { IpcServerService } from 'services/api/ipc-server';
export { JsonrpcService } from 'services/api/jsonrpc';
export { DismissablesService } from 'services/dismissables';
export { SceneCollectionsService } from 'services/scene-collections';
export { TroubleshooterService } from 'services/troubleshooter';
export { Selection, SelectionService } from 'services/selection';
export { OverlaysPersistenceService } from 'services/scene-collections/overlays';
export { SceneCollectionsStateService } from 'services/scene-collections/state';
export { FileManagerService } from 'services/file-manager';
export { ProtocolLinksService } from 'services/protocol-links';
export { ProjectorService } from 'services/projector';
export { I18nService } from 'services/i18n';
export { NVoiceCharacterService } from 'services/nvoice-character';

// ONLINE SERVICES
export { UserService } from './services/user';
export { UsageStatisticsService } from './services/usage-statistics';

// nicolive
export { CompactModeService } from 'services/compact-mode';
export { UuidService } from 'services/uuid';
export { MonitorCaptureCroppingService } from 'services/sources/monitor-capture-cropping';
export { InformationsService } from 'services/informations';
export { InformationsStateService } from 'services/informations/state';
export { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
export { NicoliveProgramStateService } from 'services/nicolive-program/state';
export { NicoliveProgramSelectorService } from 'services/nicolive-program/nicolive-program-selector';
export { NicoliveCommentViewerService } from 'services/nicolive-program/nicolive-comment-viewer';
export { NicoliveCommentFilterService } from 'services/nicolive-program/nicolive-comment-filter';
export { NicoliveCommentLocalFilterService } from 'services/nicolive-program/nicolive-comment-local-filter';
export { NicoliveCommentSynthesizerService } from 'services/nicolive-program/nicolive-comment-synthesizer';
export { NicoliveModeratorsService } from 'services/nicolive-program/nicolive-moderators';
export { NicoliveSupportersService } from 'services/nicolive-program/nicolive-supporters';
export { NVoiceClientService } from 'services/nicolive-program/n-voice-client';
export { KonomiTagsService } from 'services/nicolive-program/konomi-tags';
export { CustomcastUsageService } from 'services/custom-cast-usage';
export { RtvcStateService } from 'services/rtvcStateService';

export { IncrementalRolloutService } from 'services/incremental-rollout';
export { CrashReporterService } from 'services/crash-reporter';
export { PatchNotesService } from 'services/patch-notes';
export { VideoEncodingOptimizationService } from 'services/video-encoding-optimizations';
export { StreamingService } from 'services/streaming';

export { VideoSettingsService } from 'services/settings-v2';
