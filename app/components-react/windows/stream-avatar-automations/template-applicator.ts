import * as fs from 'fs';
import * as path from 'path';
import * as remote from '@electron/remote';
import { Services } from 'components-react/service-provider';
import { downloadFile } from 'util/requests';
import type {
  AutomationTemplateGame,
  AutomationTemplateItem,
  AutomationTemplateSource,
} from 'services/stream-avatar/stream-avatar-api-service';
import { AutomationsAnalytics } from './automations-analytics';
import { checkEnableLimit, enabledUsage } from './automations-limits';

export async function downloadAsset(downloadUrl: string, assetKey: string): Promise<string | null> {
  try {
    const dir = path.join(remote.app.getPath('userData'), 'Media');
    fs.mkdirSync(dir, { recursive: true });
    const savePath = path.join(dir, path.basename(assetKey));

    // Stream the asset to disk via the same primitive Desktop uses everywhere else.
    await downloadFile(downloadUrl, savePath);
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

  const assetFile = path.basename(source.assetKey);
  let assetPath = assets.find(a => path.basename(a) === assetFile);
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

  // Audio-only assets never report dimensions, so the fit/center branches below never fire
  // for them — hide them directly instead of waiting on a sourceUpdated that never comes.
  const isAudioOnly = /\.(mp3|wav|ogg|aac|flac|m4a)$/i.test(assetPath);

  if (sceneItem && isAudioOnly) {
    sceneItem.setVisibility(false);
  } else if (sceneItem) {
    const src = SourcesService.views.getSource(sceneItem.sourceId);
    if (src && src.width > 0 && src.height > 0) {
      sceneItem.setVisibility(true);
      sceneItem.fitToScreen(sceneItem.display);
      sceneItem.centerOnScreen(sceneItem.display);
      sceneItem.setVisibility(false);
    } else {
      const sub = SourcesService.sourceUpdated.subscribe(s => {
        if (s.sourceId === sceneItem.sourceId && s.width > 0 && s.height > 0) {
          sub.unsubscribe();
          sceneItem.setVisibility(true);
          sceneItem.fitToScreen(sceneItem.display);
          sceneItem.centerOnScreen(sceneItem.display);
          sceneItem.setVisibility(false);
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

  // Everything past the tier cap is still created, just switched off. Prompt once
  // up front rather than once per template.
  const totalSelected = Object.values(selections).reduce((sum, set) => sum + set.size, 0);
  checkEnableLimit(totalSelected, 'templates');
  const usage = enabledUsage();
  let remaining = Math.max(0, usage.max - usage.count);

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

      const enabled = (item.automation.enabled ?? true) && remaining > 0;
      if (enabled) remaining -= 1;
      await AutomationsService.actions.create({ ...item.automation, enabled });
      AutomationsAnalytics.templateAdded(
        game.game,
        item.automation.conditions[0]?.type ?? 'unknown',
        item.automation.actions.map(a => a.type),
      );
    }
  }
}
