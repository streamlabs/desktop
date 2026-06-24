import React, { useState } from 'react';
import { Button, Switch } from 'antd';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import type { ConditionType } from 'services/stream-avatar/engine/conditions';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import styles from './PreMadeAutomations.m.less';

interface PreMadeItem {
  title: string;
  description: string;
  gameName: string;
  color: string;
  /** CDN video URL shown in the carousel preview */
  src: string;
  /** When set, a hidden ffmpeg_source is created in the active scene */
  source?: {
    name: string;
    assetKey: string;
    downloadUrl: string;
    loop: boolean;
  };
  automation: Omit<TAutomationExport, 'id'>;
}

const PRE_MADE: PreMadeItem[] = [
  {
    title: 'Victory Royale',
    description: 'Co-host comments on each game win.',
    gameName: 'Fortnite',
    color: '#1a3a5c',
    src: 'https://cdn-avatar-builds.streamlabs.com/assets/victory-royale-celebration.webm',
    source: {
      name: 'victory-royale',
      assetKey: 'victory-royale-celebration-animation.webm',
      downloadUrl:
        'https://cdn-avatar-builds.streamlabs.com/assets/victory-royale-celebration-animation.webm',
      loop: false,
    },
    automation: {
      description: 'Victory Royale',
      enabled: true,
      conditions: [{ type: 'fortnite.victory_royale' as ConditionType }],
      actions: [
        { type: 'common.show_source', props: { source: { name: 'victory-royale' } } },
        { type: 'co-host.comment' },
        { type: 'common.wait_for_ms', props: { duration: 5000 } },
        { type: 'common.hide_source', props: { source: { name: 'victory-royale' } } },
      ],
    },
  },
  {
    title: 'Enemy Eliminated',
    description: 'Co-host comments on enemy elimination.',
    gameName: 'Fortnite',
    color: '#2d4a1e',
    src: 'https://cdn-avatar-builds.streamlabs.com/assets/player-killed.webm',
    source: {
      name: 'player-killed',
      assetKey: 'player-killed-animation.webm',
      downloadUrl: 'https://cdn-avatar-builds.streamlabs.com/assets/player-killed-animation.webm',
      loop: false,
    },
    automation: {
      description: 'Enemy Eliminated',
      enabled: true,
      conditions: [{ type: 'fortnite.player_eliminated' as ConditionType }],
      actions: [
        { type: 'common.show_source', props: { source: { name: 'player-killed' } } },
        { type: 'co-host.comment' },
        { type: 'common.wait_for_ms', props: { duration: 5000 } },
        { type: 'common.hide_source', props: { source: { name: 'player-killed' } } },
      ],
    },
  },
  {
    title: 'Low Player Health',
    description: 'Co-host comments when player health is low.',
    gameName: 'Fortnite',
    color: '#3a1a1a',
    src: 'https://cdn-avatar-builds.streamlabs.com/assets/low-player-health.webm',
    source: {
      name: 'low-player-health',
      assetKey: 'low-player-health-animation',
      downloadUrl:
        'https://cdn-avatar-builds.streamlabs.com/assets/low-player-health-animation.webm',
      loop: true,
    },
    automation: {
      description: 'Low Player Health',
      enabled: true,
      conditions: [{ type: 'fortnite.low_health' as ConditionType }],
      actions: [
        {
          type: 'common.show_source',
          props: { source: { name: 'low-player-health' }, hide_if_condition_false: true },
        },
        { type: 'co-host.comment' },
      ],
    },
  },
  {
    title: 'Player Eliminated',
    description: 'Co-host comments when you are eliminated.',
    gameName: 'Fortnite',
    color: '#2a1a3a',
    src: 'https://cdn-avatar-builds.streamlabs.com/assets/player-eliminated.webm',
    source: {
      name: 'player-eliminated',
      assetKey: 'player-eliminated-animation.webm',
      downloadUrl:
        'https://cdn-avatar-builds.streamlabs.com/assets/player-eliminated-animation.webm',
      loop: false,
    },
    automation: {
      description: 'Player Eliminated',
      enabled: true,
      conditions: [{ type: 'fortnite.player_eliminated' as ConditionType }],
      actions: [
        { type: 'common.show_source', props: { source: { name: 'player-eliminated' } } },
        { type: 'co-host.comment' },
        { type: 'common.wait_for_ms', props: { duration: 3000 } },
        { type: 'common.hide_source', props: { source: { name: 'player-eliminated' } } },
      ],
    },
  },
];

async function downloadAsset(downloadUrl: string, assetKey: string): Promise<string | null> {
  try {
    const os = require('os') as typeof import('os');
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');

    const dir = path.join(os.tmpdir(), 'slobs-avatar-assets');
    fs.mkdirSync(dir, { recursive: true });
    const savePath = path.join(dir, path.basename(assetKey));

    console.log('[downloadAsset] downloading', downloadUrl, '->', savePath);
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(savePath, Buffer.from(buffer));
    console.log('[downloadAsset] saved', savePath);
    return savePath;
  } catch (e: unknown) {
    console.error('[downloadAsset] failed:', e);
    return null;
  }
}

async function createSourceIfNeeded(
  sourceName: string,
  assetKey: string,
  downloadUrl: string,
  loop: boolean,
  assets: string[],
) {
  console.log('[createSourceIfNeeded] start', {
    sourceName,
    assetKey,
    loop,
    assetCount: assets.length,
  });

  const { ScenesService, SourcesService } = Services;
  const activeScene = ScenesService.views.activeScene;
  if (!activeScene) {
    console.warn('[createSourceIfNeeded] no active scene, aborting');
    return;
  }
  console.log('[createSourceIfNeeded] active scene:', activeScene.id, activeScene.name);

  // Dedup: skip if a source with this name is already in the active scene
  const existingSource = SourcesService.views.sources.find(s => s.name === sourceName);
  console.log(
    '[createSourceIfNeeded] existing source:',
    existingSource ? existingSource.sourceId : 'none',
  );
  if (existingSource) {
    const sceneItems = activeScene.getItems();
    const inScene = sceneItems.some((item: any) => item.sourceId === existingSource.sourceId);
    console.log(
      '[createSourceIfNeeded] already in scene:',
      inScene,
      '| scene item count:',
      sceneItems.length,
    );
    if (inScene) return;
  }

  let assetPath = assets.find(a => a.includes(assetKey));
  console.log(
    '[createSourceIfNeeded] asset path:',
    assetPath ?? 'NOT FOUND',
    '| searched key:',
    assetKey,
  );

  if (!assetPath) {
    console.log('[createSourceIfNeeded] asset not found locally, downloading from:', downloadUrl);
    assetPath = (await downloadAsset(downloadUrl, assetKey)) ?? undefined;
    if (!assetPath) {
      console.warn('[createSourceIfNeeded] download failed, aborting');
      return;
    }
  }

  console.log('[createSourceIfNeeded] creating source:', sourceName, 'at', assetPath);
  const sceneItemId = await ScenesService.actions.return.createAndAddSource(
    activeScene.id,
    sourceName,
    'ffmpeg_source',
    { local_file: assetPath, loop },
  );
  console.log('[createSourceIfNeeded] scene item id:', sceneItemId);

  if (sceneItemId) {
    const scene = ScenesService.views.getScene(activeScene.id);
    const sceneItem = scene?.getItem(sceneItemId);
    sceneItem?.setVisibility(false);
    console.log('[createSourceIfNeeded] visibility set to hidden');
  }
}

interface Props {
  onClose: () => void;
}

export default function PreMadeAutomations({ onClose }: Props) {
  const { AutomationsService } = Services;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [enabledSet, setEnabledSet] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggleItem(index: number) {
    setEnabledSet(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function goTo(index: number) {
    setCurrentIndex(index);
  }

  async function handleComplete() {
    setSaving(true);
    try {
      const assets: string[] =
        (await (window as any)?.streamlabsOBS?.v1?.NativeComponents?.getAssets?.()) ?? [];

      for (const index of enabledSet) {
        const item = PRE_MADE[index];

        if (item.source) {
          try {
            await createSourceIfNeeded(
              item.source.name,
              item.source.assetKey,
              item.source.downloadUrl,
              item.source.loop,
              assets,
            );
          } catch {
            // non-fatal — continue creating the automation
          }
        }

        await AutomationsService.actions.create(item.automation);
      }
    } finally {
      setSaving(false);
    }
    onClose();
  }

  const current = PRE_MADE[currentIndex];

  const footer = (
    <>
      <Button onClick={onClose} disabled={saving}>
        {$t('Cancel')}
      </Button>
      <Button
        type="primary"
        style={{ marginLeft: '8px' }}
        onClick={handleComplete}
        disabled={saving || enabledSet.size === 0}
      >
        {saving ? $t('Adding...') : $t('Complete')}
      </Button>
    </>
  );

  return (
    <ModalLayout footer={footer}>
      <div className={styles.container}>
        <div className={styles.gameIcon}>
          <i className="icon-streamlabs" />
        </div>

        <h2 className={styles.title}>{$t('Select Pre-made Automation')}</h2>

        <div className={styles.featured}>
          <div className={styles.card}>
            <div className={styles.preview}>
              <video
                key={current.src}
                src={current.src}
                className={styles.previewVideo}
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
            <div className={styles.infoRow}>
              <div>
                <div className={styles.itemTitle}>{current.title}</div>
                <div className={styles.itemDesc}>{current.description}</div>
              </div>
              <Switch
                checked={enabledSet.has(currentIndex)}
                onChange={() => toggleItem(currentIndex)}
              />
            </div>
          </div>
        </div>

        <div className={styles.thumbnailStrip}>
          {PRE_MADE.map((item, i) => (
            <div
              key={i}
              className={`${styles.thumbnail} ${i === currentIndex ? styles.thumbnailActive : ''}`}
              onClick={() => goTo(i)}
            >
              <video
                src={item.src}
                autoPlay
                muted
                loop
                playsInline
                className={styles.thumbnailVideo}
              />
            </div>
          ))}
        </div>

        <div className={styles.dots}>
          {PRE_MADE.map((_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i === currentIndex ? styles.dotActive : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </ModalLayout>
  );
}
