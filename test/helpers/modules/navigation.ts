import { click, focusMain } from './core';

export async function showPage(page: string) {
  await focusMain();
  await click(`[data-testid=nav-menu] div[title="${page}"]`);
}
