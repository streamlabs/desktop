import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import cx from 'classnames';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import type {
  AutomationTemplateGame,
  AutomationTemplateItem,
  AutomationTemplateSource,
} from 'services/stream-avatar/stream-avatar-api-service';
import { AutomationsAnalytics } from './AutomationsAnalytics';
import PreMadeAutomationsFooter from './PreMadeAutomationsFooter';
import styles from './PreMadeAutomations.m.less';

// ponytail: badge color is a deterministic hash of the game name, not a server
// field — good enough for a letter badge without inventing a color-config surface.
const BADGE_COLORS = ['#7c5cff', '#f97316', '#22c55e', '#ef4444', '#06b6d4', '#eab308'];
function badgeColor(name: string): string {
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.mov'];
function isVideoUrl(url?: string): boolean {
  return !!url && VIDEO_EXTENSIONS.some(ext => url.toLowerCase().endsWith(ext));
}

// Preview assets can be a static image, a gif, or a video (.webm) — render the
// right tag for the format instead of assuming one media type for all templates.
function TemplatePreview({ src, className }: { src?: string; className?: string }) {
  if (!src) return null;
  return isVideoUrl(src) ? (
    <video key={src} src={src} className={className} autoPlay muted loop playsInline />
  ) : (
    <img key={src} src={src} className={className} />
  );
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

function isSourceAlreadyInScene(sourceName: string): boolean {
  const { ScenesService, SourcesService } = Services;
  const activeScene = ScenesService.views.activeScene;
  if (!activeScene) return false;

  const existingSource = SourcesService.views.sources.find(s => s.name === sourceName);
  if (!existingSource) return false;

  return activeScene.getItems().some((item: any) => item.sourceId === existingSource.sourceId);
}

async function createTemplateSource(source: AutomationTemplateSource, assets: string[]) {
  if (isSourceAlreadyInScene(source.name)) return;

  const { ScenesService } = Services;
  const activeScene = ScenesService.views.activeScene;
  if (!activeScene) return;

  let assetPath = assets.find(a => a.includes(source.assetKey));
  if (!assetPath) {
    assetPath = (await downloadAsset(source.downloadUrl, source.assetKey)) ?? undefined;
    if (!assetPath) return;
  }

  const settings =
    source.type === 'ffmpeg_source'
      ? { local_file: assetPath, loop: source.loop }
      : { file: assetPath };

  const sceneItemId = await ScenesService.actions.return.createAndAddSource(
    activeScene.id,
    source.name,
    source.type,
    settings,
  );
  if (!sceneItemId) return;

  const scene = ScenesService.views.getScene(activeScene.id);
  const sceneItem = scene?.getItem(sceneItemId);
  sceneItem?.fitToScreen();
  sceneItem?.setVisibility(false);
}

interface Props {
  onCancel: () => void;
  onSaved?: () => void;
  embedded?: boolean;
  onFooterChange?: (footer: {
    totalSelected: number;
    saving: boolean;
    onComplete: () => void;
  }) => void;
}

export default function PreMadeAutomations({ onCancel, onSaved, embedded, onFooterChange }: Props) {
  const { AutomationsService, StreamAvatarApiService } = Services;
  const [games, setGames] = useState<AutomationTemplateGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGameIndex, setActiveGameIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, Set<number>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    StreamAvatarApiService.getAutomationTemplates()
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

  function toggleGameSelection(game: AutomationTemplateGame) {
    const current = selections[game.game]?.size ?? 0;
    setGameSelection(game.game, current > 0 ? new Set() : new Set(game.templates.map((_, i) => i)));
  }

  const totalSelected = Object.values(selections).reduce((sum, set) => sum + set.size, 0);

  useEffect(() => {
    onFooterChange?.({ totalSelected, saving, onComplete: handleComplete });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSelected, saving]);

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

          for (const src of item.sources ?? []) {
            try {
              await createTemplateSource(src, assets);
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
    onSaved?.();
  }

  const footer = (
    <PreMadeAutomationsFooter
      totalSelected={totalSelected}
      saving={saving}
      onCancel={onCancel}
      onComplete={handleComplete}
    />
  );

  const content = (
    <div className={cx(styles.container, { [styles.containerEmbedded]: embedded })}>
      {loading || !activeGame ? (
        <Spin />
      ) : (
        <>
          <div className={styles.mainRow}>
            <div className={styles.coverPanel}>
              <TemplatePreview
                src={activeGame.templates[0]?.gifUrl}
                className={styles.coverVideo}
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
                    ? $t('De-Select all')
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
                    <TemplatePreview
                      src={activeSelection.has(i) ? item.gifUrl : item.imageUrl}
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
                        <TemplatePreview
                          src={
                            i === activeGameIndex
                              ? game.templates[0]?.gifUrl
                              : game.templates[0]?.imageUrl
                          }
                          className={styles.gameCardVideo}
                        />
                        <span
                          className={styles.gameCardBadge}
                          style={{ background: badgeColor(game.gameName) }}
                        >
                          {game.gameName[0]}
                        </span>
                        <span className={styles.gameCardName}>{game.gameName}</span>
                        <div
                          className={cx(styles.gameCardCheck, {
                            [styles.gameCardCheckActive]: selectedCount > 0,
                          })}
                          onClick={e => {
                            e.stopPropagation();
                            toggleGameSelection(game);
                          }}
                        >
                          {selectedCount > 0 && <i className="icon-check-mark" />}
                        </div>
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
  );

  return embedded ? (
    content
  ) : (
    <ModalLayout footer={footer} scrollable>
      <div className={styles.brandHeader}>
        <h1 className={styles.brandTitle}>{$t('Select from Templates')}</h1>
      </div>
      {content}
    </ModalLayout>
  );
}
