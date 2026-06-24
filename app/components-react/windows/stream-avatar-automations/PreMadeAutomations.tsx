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
    title: 'Player Eliminated',
    description: 'Co-host comments on player elimination.',
    gameName: 'Fortnite',
    color: '#2d4a1e',
    src: 'https://cdn-avatar-builds.streamlabs.com/assets/player-killed.webm',
    source: { name: 'player-killed', assetKey: 'player-killed-animation.webm', loop: false },
    automation: {
      description: 'Player Eliminated',
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
    source: { name: 'low-player-health', assetKey: 'low-player-health-animation', loop: true },
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
    title: 'Enemy Knocked',
    description: 'Co-host comments on enemy knockdowns.',
    gameName: 'Fortnite',
    color: '#2a1a3a',
    src: 'https://cdn-avatar-builds.streamlabs.com/assets/player-eliminated.webm',
    source: { name: 'enemy-eliminated', assetKey: 'player-eliminated-animation.webm', loop: false },
    automation: {
      description: 'Enemy Knocked',
      enabled: true,
      conditions: [{ type: 'fortnite.knocked' as ConditionType }],
      actions: [
        { type: 'common.show_source', props: { source: { name: 'enemy-eliminated' } } },
        { type: 'co-host.comment' },
        { type: 'common.wait_for_ms', props: { duration: 3000 } },
        { type: 'common.hide_source', props: { source: { name: 'enemy-eliminated' } } },
      ],
    },
  },
];

async function createSourceIfNeeded(
  sourceName: string,
  assetKey: string,
  loop: boolean,
  assets: string[],
) {
  const { ScenesService, SourcesService } = Services;
  const activeScene = ScenesService.views.activeScene;
  if (!activeScene) return;

  // Dedup: skip if a source with this name is already in the active scene
  const existingSource = SourcesService.views.sources.find(s => s.name === sourceName);
  if (existingSource) {
    const inScene = activeScene
      .getItems()
      .some((item: any) => item.sourceId === existingSource.sourceId);
    if (inScene) return;
  }

  const assetPath = assets.find(a => a.includes(assetKey));
  if (!assetPath) return;

  const sceneItem = activeScene.createAndAddSource(sourceName, 'ffmpeg_source', {
    local_file: assetPath,
    loop,
  });
  sceneItem?.setVisibility(false);
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
              item.source.loop,
              assets,
            );
          } catch {
            // non-fatal — continue creating the automation
          }
        }

        await AutomationsService.actions.create(item.automation);
      }

      onClose();
    } finally {
      setSaving(false);
    }
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
