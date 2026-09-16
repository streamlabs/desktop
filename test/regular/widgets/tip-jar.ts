import { test, useWebdriver } from '../../helpers/webdriver';
import { addSource } from '../../helpers/modules/sources';
import { waitForDisplayed, clickWhenDisplayed, closeWindow } from '../../helpers/modules/core';
import { logIn } from '../../helpers/webdriver/user';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Set tip-jar settings', async t => {
  if (!(await logIn(t))) return;

  await addSource('The Jar', 'The Jar', false, true);
  await clickWhenDisplayed('li=Jar Image', { timeout: 15000 });

  const client = t.context.app.client;
  const martiniGlass = '[src="https://cdn.streamlabs.com/static/tip-jar/jars/glass-martini.png"]';
  await (await client.$(martiniGlass)).waitForDisplayed({ timeout: 15000 });
  await (await client.$(martiniGlass)).click();
  await waitForDisplayed('[data-name="image-option-active"]', { timeout: 15000 });
  await closeWindow('child');
  t.pass();
});
