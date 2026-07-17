import { Services } from 'components-react/service-provider';
import type {
  AutomationTemplateGame,
  AutomationTemplateItem,
  AutomationTemplateSource,
} from 'services/stream-avatar/stream-avatar-api-service';
import { AutomationsAnalytics } from './automations-analytics';

export async function downloadAsset(downloadUrl: string, assetKey: string): Promise<string | null> {
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

export function isSourceAlreadyInScene(sourceName: string): boolean {
  const { ScenesService, SourcesService } = Services;
  const activeScene = ScenesService.views.activeScene;
  if (!activeScene) return false;

  const existingSource = SourcesService.views.sources.find(s => s.name === sourceName);
  if (!existingSource) return false;

  return activeScene.getItems().some((item: any) => item.sourceId === existingSource.sourceId);
}

export async function createTemplateSource(
  source: AutomationTemplateSource,
  assets: string[],
): Promise<void> {
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
  const { AudioService, SourcesService } = Services;

  if (sceneItem) {
    sceneItem.setVisibility(false);

    const src = SourcesService.views.getSource(sceneItem.sourceId);
    if (src && src.width > 0 && src.height > 0) {
      sceneItem.fitToScreen(sceneItem.display);
      sceneItem.centerOnScreen(sceneItem.display);
    } else {
      const sub = SourcesService.sourceUpdated.subscribe(s => {
        if (s.sourceId === sceneItem.sourceId && s.width > 0 && s.height > 0) {
          sub.unsubscribe();
          sceneItem.fitToScreen(sceneItem.display);
          sceneItem.centerOnScreen(sceneItem.display);
        }
      });
      setTimeout(() => sub.unsubscribe(), 5000);
    }
  }
  if (source.type === 'ffmpeg_source' && sceneItem?.sourceId) {
    AudioService.actions.setSettings(sceneItem.sourceId, { monitoringType: 2 });
  }
}

export async function applyTemplates(
  selections: Record<string, Set<number>>,
  games: AutomationTemplateGame[],
): Promise<void> {
  const { AutomationsService } = Services;

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
}
