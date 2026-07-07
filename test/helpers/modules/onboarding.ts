import { useMainWindow, clickWhenDisplayed } from './core';

export async function skipOnboarding() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await clickWhenDisplayed('a=Log In', { timeout: 5000 });
    await clickWhenDisplayed('button=Skip', { timeout: 5000 });
    await clickWhenDisplayed('button=Skip', { timeout: 5000 });
  });
}
