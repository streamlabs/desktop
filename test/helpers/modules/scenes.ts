// Scene helper functions
import { click, focusChild, focusMain, getClient } from './core';
import { contextMenuClick } from '../webdriver/context-menu';
import { dialogDismiss } from '../webdriver/dialog';

export const DefaultSceneName = 'シーン';
export const PresetSceneName = 'プリセット';

async function clickSceneAction(selector: string) {
  await click(`[data-test="SceneSelector"] ${selector}`);
}

export async function clickAddScene() {
  await clickSceneAction('[data-test="Add"]');
}

export async function clickRemoveScene() {
  await clickSceneAction('[data-test="Remove"]');
  await dialogDismiss('OK');
}

export async function clickSceneTransitions() {
  await clickSceneAction('[data-test="Edit"]');
}

export async function selectScene(name: string) {
  const sel = `[data-test="SceneSelector"] [data-test="${name}"]`;
  await click(sel);
}

export async function rightClickScene(name: string) {
  const sel = `[data-test="SceneSelector"] [data-test="${name}"]`;
  await click(sel, { button: 'right' });
}

export async function addScene(name: string) {
  await focusMain();
  await clickAddScene();
  await focusChild();
  await getClient().$('input').setValue(name);
  await click('[data-test="Done"]');
}

export async function openRenameWindow(sceneName: string) {
  await focusMain();
  await rightClickScene(sceneName);
  await contextMenuClick('Rename');
  await focusChild();
}

export async function sceneIsExisting(sceneName: string) {
  return sceneExisting(sceneName);
}

export async function openDuplicateWindow(sourceName: string) {
  await focusMain();
  await rightClickScene(sourceName);
  await contextMenuClick('Duplicate');
  await focusChild();
}

export async function sceneExisting(name: string) {
  return getClient().$(`[data-test="SceneSelector"]`).$(`[data-test="${name}"]`).isExisting();
}
