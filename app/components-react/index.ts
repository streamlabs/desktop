import NameFolder from './windows/NameFolder';
import NameScene from './windows/NameScene';
import GoLiveWindow from './windows/go-live/GoLiveWindow';
import EditStreamWindow from './windows/go-live/EditStreamWindow';
import IconLibraryProperties from './windows/IconLibraryProperties';
import ScreenCaptureProperties from './windows/ScreenCaptureProperties';
import GuestCamProperties from './windows/GuestCamProperties';
import News from './windows/notifications/News';
import PerformanceMetrics from './shared/PerformanceMetrics';
import Display from './shared/Display';
import TitleBar from './shared/TitleBar';
import PlatformLogo from './shared/PlatformLogo';
import AdvancedStatistics from './windows/AdvancedStatistics';
import { createRoot } from './root/ReactRoot';
import SourceProperties from './windows/SourceProperties';
import RenameSource from './windows/RenameSource';
import SharedComponentsLibrary from './windows/sharedComponentsLibrary/SharedComponentsLibrary';
import ManageSceneCollections from './windows/ManageSceneCollections';
import { WidgetWindow } from './widgets/common/WidgetWindow';
import SafeMode from './windows/SafeMode';
import AdvancedAudio from './windows/advanced-audio';
import { CustomCodeWindow } from './widgets/common/CustomCode';
import SourceShowcase from './windows/source-showcase';
import SourceFilters from './windows/SourceFilters';
import RecentEvents from './editor/elements/RecentEvents';
import BrowserView from './shared/BrowserView';
import MediaGallery from './windows/MediaGallery';
import Projector from './windows/Projector';
import AddSource from './windows/AddSource';
import SideNav from './sidebar/SideNav';
import WelcomeToPrime from './windows/WelcomeToPrime';
import Notifications from './windows/notifications/Notifications';
import NotificationsAndNews from './windows/notifications';
import MultistreamChatInfo from './windows/MultistreamChatInfo';
import Blank from './windows/Blank';
import PlatformAppPageView from './shared/PlatformAppPageView';
import PlatformAppPopOut from './windows/PlatformAppPopOut';
import RecentEventsWindow from './windows/RecentEvents';
import DismissableBadge from './shared/DismissableBadge';
import UltraIcon from './shared/UltraIcon';
import EditTransform from './windows/EditTransform';
import MarketingModal from './windows/MarketingModal';
import Main from './windows/Main';
import Loader from './pages/Loader';
import StartStreamingButton from './root/StartStreamingButton';
import TestWidgets from './root/TestWidgets';
import { PlatformMerge, PlatformAppStore, PlatformAppMainPage } from './pages';
import Settings from './windows/Settings';

// list of React components to be used inside Vue components
export const components = {
  NameFolder,
  NameScene,
  BrowserView,
  GoLiveWindow: createRoot(GoLiveWindow),
  EditStreamWindow: createRoot(EditStreamWindow),
  IconLibraryProperties,
  ScreenCaptureProperties,
  GuestCamProperties: createRoot(GuestCamProperties),
  News,
  PerformanceMetrics,
  ManageSceneCollections,
  Display,
  TitleBar,
  PlatformLogo,
  Projector,
  AdvancedStatistics,
  SourceProperties: createRoot(SourceProperties),
  SharedComponentsLibrary: createRoot(SharedComponentsLibrary),
  RenameSource,
  WidgetWindow: createRoot(WidgetWindow),
  CustomCodeWindow: createRoot(CustomCodeWindow),
  SafeMode,
  AdvancedAudio: createRoot(AdvancedAudio),
  SourceShowcase: createRoot(SourceShowcase),
  SourceFilters,
  RecentEvents,
  MediaGallery,
  AddSource,
  RecentEventsWindow,
  SideNav,
  WelcomeToPrime,
  Notifications,
  NotificationsAndNews,
  MultistreamChatInfo,
  PlatformMerge,
  PlatformAppStore,
  PlatformAppMainPage,
  PlatformAppPageView,
  PlatformAppPopOut,
  DismissableBadge,
  UltraIcon,
  EditTransform,
  Blank,
  MarketingModal,
  Main: createRoot(Main),
  Loader,
  StartStreamingButton,
  TestWidgets,
  Settings: createRoot(Settings),
};
