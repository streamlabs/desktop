import { click, focusMain } from './core';

export async function showPage(page: string) {
  await focusMain();
  await click(`.nav-menu div[title="${page}"]`);
}
