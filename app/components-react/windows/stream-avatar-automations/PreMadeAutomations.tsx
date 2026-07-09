import React, { useEffect, useState } from 'react';
import { Button, Spin, Switch } from 'antd';
import cx from 'classnames';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import type {
  AutomationTemplateGame,
  AutomationTemplateItem,
} from 'services/stream-avatar/agent-socket-service';
import { AutomationsAnalytics } from './AutomationsAnalytics';
import styles from './PreMadeAutomations.m.less';

// ponytail: badge color is a deterministic hash of the game name, not a server
// field — good enough for a letter badge without inventing a color-config surface.
const BADGE_COLORS = ['#7c5cff', '#f97316', '#22c55e', '#ef4444', '#06b6d4', '#eab308'];
function badgeColor(name: string): string {
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

async function downloadAsset(downloadUrl: string, assetKey: string): Promise<string | null> {
  try {
    const os = require('os') as typeof import('os');
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');

    const dir = path.join(os.tmpdir(), 'slobs-avatar-assets');
    fs.mkdirSync(dir, { recursive: true });
    const savePath = path.join(dir, path.basename(assetKey));

    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(savePath, new Uint8Array(buffer));
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
  const { ScenesService, SourcesService } = Services;
  const activeScene = ScenesService.views.activeScene;
  if (!activeScene) return;

  // Dedup: skip if a source with this name is already in the active scene
  const existingSource = SourcesService.views.sources.find(s => s.name === sourceName);
  if (existingSource) {
    const sceneItems = activeScene.getItems();
    const inScene = sceneItems.some((item: any) => item.sourceId === existingSource.sourceId);
    if (inScene) return;
  }

  let assetPath = assets.find(a => a.includes(assetKey));
  if (!assetPath) {
    assetPath = (await downloadAsset(downloadUrl, assetKey)) ?? undefined;
    if (!assetPath) return;
  }

  const sceneItemId = await ScenesService.actions.return.createAndAddSource(
    activeScene.id,
    sourceName,
    'ffmpeg_source',
    { local_file: assetPath, loop },
  );

  if (sceneItemId) {
    const scene = ScenesService.views.getScene(activeScene.id);
    const sceneItem = scene?.getItem(sceneItemId);
    sceneItem?.setVisibility(false);
  }
}

interface Props {
  onClose: () => void;
}

export default function PreMadeAutomations({ onClose }: Props) {
  const { AutomationsService, AgentSocketService } = Services;
  const [games, setGames] = useState<AutomationTemplateGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGameIndex, setActiveGameIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, Set<number>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AgentSocketService.getAutomationTemplates()
      .then(setGames)
      .finally(() => setLoading(false));
  }, []);

  const activeGame: AutomationTemplateGame | undefined = games[activeGameIndex];
  const activeSelection = (activeGame && selections[activeGame.game]) ?? new Set<number>();

  function setGameSelection(gameKey: string, next: Set<number>) {
    setSelections(prev => ({ ...prev, [gameKey]: next }));
  }

  function toggleTemplate(index: number) {
    if (!activeGame) return;
    const next = new Set(activeSelection);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setGameSelection(activeGame.game, next);
  }

  function toggleSelectAll() {
    if (!activeGame) return;
    const allSelected = activeSelection.size === activeGame.templates.length;
    setGameSelection(
      activeGame.game,
      allSelected ? new Set() : new Set(activeGame.templates.map((_, i) => i)),
    );
  }

  function toggleGameSwitch(game: AutomationTemplateGame) {
    const current = selections[game.game]?.size ?? 0;
    setGameSelection(game.game, current > 0 ? new Set() : new Set(game.templates.map((_, i) => i)));
  }

  const totalSelected = Object.values(selections).reduce((sum, set) => sum + set.size, 0);

  async function handleComplete() {
    setSaving(true);
    try {
      const assets: string[] =
        (await (window as any)?.streamlabsOBS?.v1?.NativeComponents?.getAssets?.()) ?? [];

      for (const game of games) {
        const indices = selections[game.game];
        if (!indices || indices.size === 0) continue;

        for (const index of indices) {
          const item: AutomationTemplateItem = game.templates[index];

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
          AutomationsAnalytics.templateAdded(
            game.game,
            item.automation.conditions[0]?.type ?? 'unknown',
            item.automation.actions.map(a => a.type),
          );
        }
      }
    } finally {
      setSaving(false);
    }
    onClose();
  }

  const addLabel =
    totalSelected === 1
      ? $t('Add %{count} Automation', { count: totalSelected })
      : $t('Add %{count} Automations', { count: totalSelected });

  const footer = (
    <>
      <Button onClick={onClose} disabled={saving}>
        {$t('Cancel')}
      </Button>
      <Button
        type="primary"
        style={{ marginLeft: '8px' }}
        onClick={handleComplete}
        disabled={saving || totalSelected === 0}
      >
        {saving ? $t('Adding...') : addLabel}
      </Button>
    </>
  );

  return (
    <ModalLayout footer={footer}>
      <div className={styles.container}>
        {loading || !activeGame ? (
          <Spin />
        ) : (
          <>
            <div className={styles.mainRow}>
              <div className={styles.coverPanel}>
                <video
                  key={activeGame.templates[0]?.videoUrl}
                  src={activeGame.templates[0]?.videoUrl}
                  className={styles.coverVideo}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
                <div className={styles.coverTopOverlay}>
                  <span
                    className={styles.badge}
                    style={{ background: badgeColor(activeGame.gameName) }}
                  >
                    {activeGame.gameName[0]}
                  </span>
                  <span className={styles.coverGameName}>{activeGame.gameName}</span>
                </div>
                <div className={styles.coverBottomOverlay}>
                  {$t('%{count} automations', { count: activeGame.templates.length })}
                </div>
              </div>

              <div className={styles.checklistPanel}>
                <div className={styles.checklistHeader}>
                  <span>{$t('What your co-host will react to')}</span>
                  <a onClick={toggleSelectAll}>
                    {activeSelection.size === activeGame.templates.length
                      ? $t('Unselect all')
                      : $t('Select all')}
                  </a>
                </div>
                <div className={styles.checklist}>
                  {activeGame.templates.map((item, i) => (
                    <div
                      key={i}
                      className={cx(styles.checklistRow, {
                        [styles.checklistRowActive]: activeSelection.has(i),
                      })}
                      onClick={() => toggleTemplate(i)}
                    >
                      <video
                        src={item.videoUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className={styles.rowThumb}
                      />
                      <div className={styles.rowText}>
                        <div className={styles.rowTitle}>{item.title}</div>
                        <div className={styles.rowDesc}>{item.description}</div>
                      </div>
                      <div
                        className={cx(styles.rowCheck, {
                          [styles.rowCheckActive]: activeSelection.has(i),
                        })}
                      >
                        {activeSelection.has(i) && <i className="icon-check-mark" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {games.length > 1 && (
              <>
                <div className={styles.gameCards}>
                  {games.map((game, i) => {
                    const selectedCount = selections[game.game]?.size ?? 0;
                    return (
                      <div
                        key={game.game}
                        className={cx(styles.gameCard, {
                          [styles.gameCardActive]: i === activeGameIndex,
                        })}
                        onClick={() => setActiveGameIndex(i)}
                      >
                        <div className={styles.gameCardThumb}>
                          <video
                            src={game.templates[0]?.videoUrl}
                            autoPlay
                            muted
                            loop
                            playsInline
                            className={styles.gameCardVideo}
                          />
                          <span
                            className={styles.gameCardBadge}
                            style={{ background: badgeColor(game.gameName) }}
                          >
                            {game.gameName[0]}
                          </span>
                          <span className={styles.gameCardName}>{game.gameName}</span>
                          <Switch
                            size="small"
                            className={styles.gameCardSwitch}
                            checked={selectedCount > 0}
                            onClick={(_checked, e) => {
                              e.stopPropagation();
                              toggleGameSwitch(game);
                            }}
                          />
                          <div className={styles.gameCardSub}>
                            {selectedCount > 0
                              ? $t('%{count} of %{total} added', {
                                  count: selectedCount,
                                  total: game.templates.length,
                                })
                              : $t('%{count} automations', { count: game.templates.length })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.dots}>
                  {games.map((_, i) => (
                    <span
                      key={i}
                      className={cx(styles.dot, { [styles.dotActive]: i === activeGameIndex })}
                      onClick={() => setActiveGameIndex(i)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ModalLayout>
  );
}
