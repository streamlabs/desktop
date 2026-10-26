import { TExecutionContext } from '../webdriver';
import { logIn } from '../webdriver/user';
import {
  clickButton,
  clickIfDisplayed,
  clickWhenDisplayed,
  focusMain,
  isDisplayed,
  useMainWindow,
  waitForDisplayed,
} from './core';

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

/**
 * Helper function to go through the onboarding flow through the login step
 * @param t Test execution context
 * @param newUser Whether the user is a new user
 */
export async function advancePastOnboardingLogin(t: TExecutionContext, newUser = true) {
  await focusMain();

  if (!(await isDisplayed('h1=Welcome to Streamlabs Desktop', { timeout: 5000 }))) {
    t.fail('Onboarding welcome page not shown');
    return;
  }
  await clickWhenDisplayed('a=Log In', { timeout: 5000 });

  // Complete login
  await waitForDisplayed('button=Twitch');
  const user = await logIn(t, 'twitch', { prime: false }, false, true, newUser);

  // Fake authentication bypasses the login button's navigation callback.
  // Backtracking through Splash exercises its authenticated path to Connect Platforms.
  await clickButton('Back');
  await waitForDisplayed('h1=Welcome to Streamlabs Desktop');
  await clickWhenDisplayed('a=Log In', { timeout: 5000 });
  await waitForDisplayed('h1=Connect Platforms');

  return user;
}
