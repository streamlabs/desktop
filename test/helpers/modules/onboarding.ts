import { click, clickIfDisplayed, useMainWindow, waitForDisplayed } from './core';

export async function skipOnboarding() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await waitForDisplayed('h2=Live Streaming', { timeout: 10000 });
    // Uses advanced onboarding
    await click('h2=Live Streaming');
    await click('button=Continue');
    // Auth
    await click('button=Skip');
    // OBS import
    await clickIfDisplayed('div=Start Fresh');
    // Hardware setup
    await click('button=Skip');
    // Themes
    await click('button=Skip');
    // Ultra
    await clickIfDisplayed('div[data-testid=choose-free-plan-btn]');
  });
}
