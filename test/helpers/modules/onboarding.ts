import { useMainWindow, clickWhenDisplayed, isDisplayed } from './core';

export async function skipOnboarding() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    // Onboarding doesn't reappear on app restarts, which some tests require
    const onboardingAppeared = await isDisplayed('button=Get Started', { timeout: 10000 });
    if (onboardingAppeared) {
      await clickWhenDisplayed('button=Get Started', { timeout: 5000 });
      await clickWhenDisplayed('button=Skip', { timeout: 5000 });
    }
  });
}
