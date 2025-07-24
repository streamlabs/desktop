import { test, useWebdriver } from '../../helpers/webdriver';
import { logIn } from '../../helpers/modules/user';
import { chatIsVisible, goLive, stopStream } from '../../helpers/modules/streaming';

useWebdriver();

test('Streaming to Trovo', async t => {
  await logIn('trovo');
  await goLive({
    title: 'Test',
    trovoGame: 'Fortnite',
  });
  t.true(await chatIsVisible(), 'Chat should be visible');
  await stopStream();
  t.pass();
});
