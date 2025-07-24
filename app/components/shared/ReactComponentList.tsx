import { Component } from 'vue-property-decorator';
import ReactComponent from './ReactComponent';

@Component({
  props: {
    name: { default: 'AddSource' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class AddSource extends ReactComponent {}

@Component({
  props: {
    name: { default: 'AdvancedAudio' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class AdvancedAudio extends ReactComponent {}

@Component({
  props: {
    name: { default: 'AdvancedStatistics' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class AdvancedStatistics extends ReactComponent {}

@Component({
  props: {
    name: { default: 'AlertboxLibrary' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class AlertboxLibrary extends ReactComponent {}

@Component({ props: { name: { default: 'Blank' } } })
export class Blank extends ReactComponent {}

@Component({
  props: {
    name: { default: 'BrowseOverlays' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class BrowseOverlays extends ReactComponent {}

@Component({
  props: { name: { default: 'Browser' }, wrapperStyles: { default: () => ({ height: '100%' }) } },
})
export class Browser extends ReactComponent {}

@Component({
  props: {
    name: { default: 'BrowserView' },
    componentProps: { default: () => ({ src: '' }) },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class BrowserView extends ReactComponent {}

@Component({
  props: {
    name: { default: 'Chat' },
    componentProps: { default: () => ({ restream: false }) },
    wrapperStyles: {
      default: () => ({ height: '100%', display: 'flex', flexDirection: 'column' }),
    },
  },
})
export class Chat extends ReactComponent {}

@Component({
  props: {
    name: { default: 'Display' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    componentProps: {
      default: () => ({
        paddingSize: 0,
        drawUI: false,
      }),
    },
  },
})
export class Display extends ReactComponent {}

@Component({
  props: {
    name: { default: 'DisplayElement' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    mins: { default: () => ({ x: 0, y: 0 }) },
  },
})
export class DisplayElement extends ReactComponent {}

@Component({
  props: {
    name: { default: 'EditStreamWindow' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class EditStreamWindow extends ReactComponent {}

@Component({
  props: {
    name: { default: 'EditTransform' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class EditTransform extends ReactComponent {}

@Component({
  props: {
    name: { default: 'GoLiveWindow' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class GoLiveWindow extends ReactComponent {}

@Component({
  props: {
    name: { default: 'Grow' },
    wrapperStyles: { default: () => ({ gridRow: '1 / span 1' }) },
  },
})
export class Grow extends ReactComponent {}

@Component({
  props: {
    name: { default: 'GuestCamProperties' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class GuestCamProperties extends ReactComponent {}

@Component({
  props: {
    name: { default: 'Highlighter' },
    componentProps: { default: () => ({}) },
  },
})
export class Highlighter extends ReactComponent {}

@Component({ props: { name: { default: 'LayoutEditor' } } })
export class LayoutEditor extends ReactComponent {}

@Component({ props: { name: { default: 'Loader' } } })
export class Loader extends ReactComponent {}

@Component({
  props: {
    name: { default: 'IconLibraryProperties' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class IconLibraryProperties extends ReactComponent {}

@Component({
  props: {
    name: { default: 'InstalledApps' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class InstalledApps extends ReactComponent {}

@Component({
  props: {
    name: { default: 'LegacyEvents' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    componentProps: { default: () => ({ onPopout: () => {} }) },
    mins: { default: () => ({ x: 360, y: 150 }) },
  },
})
export class LegacyEvents extends ReactComponent {}

@Component({
  props: {
    name: { default: 'LiveDock' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    componentProps: { default: () => ({ onLeft: false }) },
  },
})
export class LiveDock extends ReactComponent {}

@Component({
  props: {
    name: { default: 'ManageSceneCollections' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class ManageSceneCollections extends ReactComponent {}

@Component({
  props: {
    name: { default: 'MediaGallery' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class MediaGallery extends ReactComponent {}

@Component({
  props: {
    name: { default: 'MiniFeed' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    mins: { default: () => ({ x: 330, y: 90 }) },
  },
})
export class MiniFeed extends ReactComponent {}

@Component({
  props: {
    name: { default: 'Mixer' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    mins: { default: () => ({ x: 150, y: 120 }) },
  },
})
export class Mixer extends ReactComponent {}

@Component({
  props: {
    name: { default: 'NameFolder' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class NameFolder extends ReactComponent {}

@Component({
  props: {
    name: { default: 'NameScene' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class NameScene extends ReactComponent {}

@Component({ props: { name: { default: 'NotificationsArea' } } })
export class NotificationsArea extends ReactComponent {}

@Component({
  props: {
    name: { default: 'NotificationsAndNews' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class NotificationsAndNews extends ReactComponent {}

@Component({
  props: {
    name: { default: 'ObsSettings' },
    componentProps: { default: () => ({ page: 'General' }) },
  },
})
export class ObsSettings extends ReactComponent {}

@Component({
  props: {
    name: { default: 'Onboarding' },
  },
})
export class Onboarding extends ReactComponent {}

@Component({ props: { name: { default: 'PatchNotes' } } })
export class PatchNotes extends ReactComponent {}

@Component({
  props: {
    name: { default: 'PerformanceMetrics' },
    componentProps: { default: () => ({ mode: 'limited' }) },
  },
})
export class PerformanceMetrics extends ReactComponent<{ mode: 'full' | 'limited' }> {}

@Component({ props: { name: { default: 'PlatformAppPageView' } } })
export class PlatformAppPageView extends ReactComponent {}

@Component({ props: { name: { default: 'PlatformAppMainPage' } } })
export class PlatformAppMainPage extends ReactComponent {}

@Component({
  props: {
    name: { default: 'PlatformAppPopOut' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class PlatformAppPopOut extends ReactComponent {}

@Component({ props: { name: { default: 'PlatformAppStore' } } })
export class PlatformAppStore extends ReactComponent {}

@Component({ props: { name: { default: 'PlatformLogo' } } })
export class PlatformLogo extends ReactComponent<{
  platform: string;
  size?: 'medium' | number;
  color?: string;
  unwrapped?: boolean;
}> {}

@Component({
  props: {
    name: { default: 'PlatformMerge' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class PlatformMerge extends ReactComponent {}

@Component({
  props: { name: { default: 'Projector' }, wrapperStyles: { default: () => ({ height: '100%' }) } },
})
export class Projector extends ReactComponent {}

@Component({
  props: {
    name: { default: 'RecentEvents' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    componentProps: { default: () => ({ isOverlay: false }) },
  },
})
export class RecentEvents extends ReactComponent<{ isOverlay?: boolean }> {}

@Component({
  props: {
    name: { default: 'RecentEventsWindow' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class RecentEventsWindow extends ReactComponent {}

@Component({
  props: {
    name: { default: 'RecordingHistory' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class RecordingHistory extends ReactComponent {}

@Component({
  props: {
    name: { default: 'RecordingPreview' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    mins: { default: () => ({ x: 0, y: 0 }) },
  },
})
export class RecordingPreview extends ReactComponent {}

@Component({
  props: {
    name: { default: 'RenameSource' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class RenameSource extends ReactComponent {}

@Component({
  props: {
    name: { default: 'SafeMode' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class SafeMode extends ReactComponent {}

@Component({
  props: {
    name: { default: 'StreamPreview' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    mins: { default: () => ({ x: 0, y: 0 }) },
  },
})
export class StreamPreview extends ReactComponent {}

@Component({
  props: {
    name: { default: 'SceneSelector' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    mins: { default: () => ({ x: 200, y: 120 }) },
  },
})
export class SceneSelector extends ReactComponent {}

@Component({
  props: {
    name: { default: 'SourceSelector' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
    mins: { default: () => ({ x: 200, y: 120 }) },
  },
})
export class SourceSelector extends ReactComponent {}

@Component({
  props: {
    name: { default: 'SideNav' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class SideNav extends ReactComponent {}

@Component({
  props: {
    name: { default: 'SourceProperties' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class SourceProperties extends ReactComponent {}

@Component({
  props: {
    name: { default: 'ScreenCaptureProperties' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class ScreenCaptureProperties extends ReactComponent {}
@Component({
  props: {
    name: { default: 'SharedComponentsLibrary' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class SharedComponentsLibrary extends ReactComponent {}

@Component({
  props: {
    name: { default: 'SourceFilters' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class SourceFilters extends ReactComponent {}
@Component({
  props: {
    name: { default: 'SourceShowcase' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class SourceShowcase extends ReactComponent {}

@Component({ props: { name: { default: 'StartStreamingButton' } } })
export class StartStreamingButton extends ReactComponent {}

@Component({ props: { name: { default: 'StreamScheduler' } } })
export class StreamScheduler extends ReactComponent {}

@Component({ props: { name: { default: 'Studio' } } })
export class Studio extends ReactComponent {}

@Component({ props: { name: { default: 'StudioEditor' } } })
export class StudioEditor extends ReactComponent {}

@Component({
  props: {
    name: { default: 'StudioFooter' },
    wrapperStyles: {
      default: () => ({
        'grid-row': '2 / span 1',
        display: 'flex',
        'min-width': 0,
      }),
    },
  },
})
export class StudioFooter extends ReactComponent {}

@Component({
  props: {
    name: { default: 'TestWidgets' },
    componentProps: { default: () => ({ testers: null as string[] }) },
  },
})
export class TestWidgets extends ReactComponent<{ testers: string[] }> {}

@Component({ props: { name: { default: 'ThemeAudit' } } })
export class ThemeAudit extends ReactComponent {}

@Component({
  props: {
    name: { default: 'TitleBar' },
    componentProps: { default: () => ({ windowId: '' }) },
  },
})
export class TitleBar extends ReactComponent {}

@Component({
  props: {
    name: { default: 'WelcomeToPrime' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class WelcomeToPrime extends ReactComponent {}

@Component({
  props: {
    name: { default: 'WidgetWindow' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class WidgetWindow extends ReactComponent {}

@Component({
  props: {
    name: { default: 'CustomCodeWindow' },
    wrapperStyles: { default: () => ({ height: '100%' }) },
  },
})
export class CustomCodeWindow extends ReactComponent {}

@Component({ props: { name: { default: 'DismissableBadge' } } })
export class DismissableBadge extends ReactComponent {}
@Component({ props: { name: { default: 'UltraIcon' } } })
export class UltraIcon extends ReactComponent<{
  type?: string;
  className?: string;
}> {}

@Component({ props: { name: { default: 'AuthModal' } } })
export class AuthModal extends ReactComponent {}

@Component({
  props: {
    name: { default: 'Hotkeys' },
    componentProps: {
      default: () => ({
        globalSearchStr: '',
        highlightSearch: () => {},
        scanning: false,
      }),
    },
  },
})
export class Hotkeys extends ReactComponent<{
  globalSearchStr: string;
  highlightSearch: (searchStr: string) => void;
  scanning: boolean;
}> {}

@Component({
  props: {
    name: { default: 'GLVolmeters' },
    wrapperStyles: {
      default: () => ({ position: 'absolute', left: '17px', right: '17px', height: '100%' }),
    },
  },
})
export class GLVolmeters extends ReactComponent {}

@Component({
  props: {
    name: { default: 'MultistreamChatInfo' },
    wrapperStyles: {
      default: () => ({ width: '100%', height: '100%', minWidth: '748px', minHeight: '635px' }),
    },
  },
})
export class MultistreamChatInfo extends ReactComponent {}
