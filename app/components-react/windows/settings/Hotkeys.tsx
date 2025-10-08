import React, { useState, useEffect, useMemo } from 'react';
import { Services } from '../../service-provider';
import { IHotkeysSet, IHotkey } from 'services/hotkeys';
import HotkeyGroup from './HotkeyGroup';
import { $t } from '../../../services/i18n';
import mapValues from 'lodash/mapValues';
import Fuse from 'fuse.js';
import type { Scene, Source } from 'app-services';
import Tooltip from 'components-react/shared/Tooltip';
import { getOS, OS } from 'util/operating-systems';
import * as remote from '@electron/remote';
import { ISettingsProps } from '../Settings';

interface IAugmentedHotkey extends IHotkey {
  // Will be scene or source name
  categoryName?: string;
}

interface IAugmentedHotkeySet {
  general: IAugmentedHotkey[];
  sources: Dictionary<IAugmentedHotkey[]>;
  scenes: Dictionary<IAugmentedHotkey[]>;
  markers: IAugmentedHotkey[];
}

function hasHotkeys(hotkeyDict: Dictionary<IAugmentedHotkey[]>) {
  return Object.values(hotkeyDict).some(hotkeys => hotkeys.length);
}

const mkFilterHotkeys = (searchString: string) => (hotkeys: IHotkey[]): IHotkey[] => {
  return new Fuse(hotkeys, {
    keys: ['description', 'categoryName'],
    threshold: 0.4,
    shouldSort: true,
  }).search(searchString);
};

// Safe-guard against the object (source or scene) not being found, though unlikely
const setCategoryNameFrom = (srcOrScene: Source | Scene | null) => (hotkey: IAugmentedHotkey) => {
  if (!srcOrScene?.name) return hotkey;
  // Mutating the original object is required for bindings to work
  // TODO: We should refactor this to not rely on mutating the original objects.
  hotkey.categoryName = srcOrScene.name;
  return hotkey;
};

export function Hotkeys(props: ISettingsProps) {
  const { globalSearchStr: searchString } = props;
  const { HotkeysService, SourcesService, ScenesService, DualOutputService } = Services;
  const [hotkeySet, setHotkeysSet] = useState<IHotkeysSet | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!hotkeySet) {
      // We don't want hotkeys registering while trying to bind.
      // We may change our minds on this in the future.
      HotkeysService.actions.unregisterAll();

      HotkeysService.actions.return.getHotkeysSet().then((hotkeys: IHotkeysSet) => {
        if (!isMounted) return;
        setHotkeysSet(hotkeys);
      });
    }

    return () => {
      if (hotkeySet) {
        HotkeysService.actions.applyHotkeySet(hotkeySet);
      }
      isMounted = false;
    };
  }, [hotkeySet]);

  const emptyHotkeySet: IAugmentedHotkeySet = {
    general: {},
    sources: {},
    scenes: {},
    markers: {},
  } as IAugmentedHotkeySet;

  // Only calculate this once
  const augmentedHotkeySet = useMemo<IAugmentedHotkeySet>(() => {
    if (!hotkeySet) {
      return emptyHotkeySet;
    }

    return {
      general: hotkeySet.general,
      sources: mapValues(hotkeySet.sources, (hotkeys, sourceId) => {
        return hotkeys.map(setCategoryNameFrom(SourcesService.views.getSource(sourceId)));
      }),
      scenes: mapValues(hotkeySet.scenes, (hotkeys, sceneId) => {
        return hotkeys.map(setCategoryNameFrom(ScenesService.views.getScene(sceneId)));
      }),
      markers: hotkeySet.markers,
    };
  }, [hotkeySet]);

  const filteredHotkeySet = useMemo<IAugmentedHotkeySet>(() => {
    if (!hotkeySet) {
      return emptyHotkeySet;
    }

    const filterHotkeys = mkFilterHotkeys(searchString);

    const filteredHotkeySet: IAugmentedHotkeySet = searchString
      ? {
          general: filterHotkeys(augmentedHotkeySet.general),
          sources: mapValues(augmentedHotkeySet.sources, filterHotkeys),
          scenes: mapValues(augmentedHotkeySet.scenes, filterHotkeys),
          markers: filterHotkeys(augmentedHotkeySet.markers),
        }
      : augmentedHotkeySet;

    return filteredHotkeySet;
  }, [augmentedHotkeySet, searchString]);

  if (!hotkeySet) {
    return <div />;
  }
  const isSearch = !!searchString;
  const isDualOutputMode = DualOutputService.views.dualOutputMode;

  const generalHotkeys = filteredHotkeySet.general;
  const hasGeneralHotkeys = !!generalHotkeys.length;

  const sceneHotkeys = filteredHotkeySet.scenes;
  const hasSceneHotkeys = hasHotkeys(sceneHotkeys);

  const sourceHotkeys = filteredHotkeySet.sources;
  const hasSourceHotkeys = hasHotkeys(sourceHotkeys);

  const markerHotkeys = filteredHotkeySet.markers;
  const hasMarkers = !!markerHotkeys.length;

  function renderHotkeyGroup(
    id: string,
    hotkeys: any,
    title: string,
    isDualOutputScene: boolean = false,
  ) {
    return (
      <HotkeyGroup
        key={id}
        title={title}
        hotkeys={hotkeys}
        isSearch={isSearch}
        hasSceneHotkeys={hasSceneHotkeys}
        isDualOutputMode={isDualOutputMode}
        isDualOutputScene={isDualOutputScene}
      />
    );
  }

  function renderScenesHotkeyGroup(sceneId: string) {
    const sceneHotkeys = filteredHotkeySet.scenes[sceneId];
    const scene = ScenesService.views.getScene(sceneId);
    const isDualOutputScene = scene?.getIsDualOutputScene();

    return scene ? renderHotkeyGroup(sceneId, sceneHotkeys, scene.name, isDualOutputScene) : null;
  }

  function renderSourcesHotkeyGroup(sourceId: string) {
    const sourceHotkeys = filteredHotkeySet.sources[sourceId];
    const source = SourcesService.views.getSource(sourceId);

    return source ? renderHotkeyGroup(sourceId, sourceHotkeys, source.name) : null;
  }

  function openMarkersInfoPage() {
    remote.shell.openExternal(
      'https://streamlabs.com/content-hub/post/bookmarking-for-streamlabs-desktop',
    );
  }

  return (
    <div>
      {hasGeneralHotkeys && (
        <>
          {getOS() === OS.Mac && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h2>{$t('Hotkeys')}</h2>
              <Tooltip
                title={$t(
                  'To use hotkeys on Mac, go to System Settings > Security > Accessibility and toggle on for Streamlabs Desktop.',
                )}
                lightShadow
                wrapperStyle={{ marginBottom: '4px' }}
                placement="leftTop"
              >
                <i className="icon-information" style={{ padding: '0 0 4px 5px' }} />
              </Tooltip>
            </div>
          )}
          <HotkeyGroup
            hotkeys={generalHotkeys}
            isSearch={isSearch}
            title={null}
            isDualOutputMode={isDualOutputMode}
          />
        </>
      )}
      {hasSceneHotkeys && (
        <>
          <h2>{$t('Scenes')}</h2>
          {Object.keys(sceneHotkeys).map(renderScenesHotkeyGroup)}
        </>
      )}
      {hasSourceHotkeys && (
        <>
          <h2>{$t('Sources')}</h2>
          {Object.keys(sourceHotkeys).map(renderSourcesHotkeyGroup)}
        </>
      )}
      {hasMarkers && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>{$t('Markers')}</h2>
            <a
              onClick={openMarkersInfoPage}
              style={{
                fontWeight: 'normal',
                textDecoration: 'underline',
                color: 'var(--paragraph)',
              }}
            >
              {$t('Learn more here')}
            </a>
          </div>
          <HotkeyGroup
            hotkeys={markerHotkeys}
            isSearch={isSearch}
            title={null}
            isDualOutputMode={isDualOutputMode}
          />
        </>
      )}
    </div>
  );
}
