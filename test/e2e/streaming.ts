import { test, useWebdriver } from '../helpers/webdriver/index';
import { setFormInput } from '../helpers/webdriver/forms';
import { click, focusChild, focusMain } from '../helpers/modules/core';

useWebdriver();

test('Streaming to custom streaming server', async t => {
  const streamingServerURL = process.env.NAIR_TEST_STREAM_SERVER;
  const streamingKey = process.env.NAIR_TEST_STREAM_KEY;

  if (!(streamingServerURL && streamingKey)) {
    console.warn(
      'テスト用配信情報が不足しています。配信テストをスキップします。\n' +
        `NAIR_TEST_STREAM_SERVER: ${process.env.NAIR_TEST_STREAM_SERVER}\n` +
        `NAIR_TEST_STREAM_KEY   : ${process.env.NAIR_TEST_STREAM_KEY}`,
    );
    t.pass();
    return;
  }

  const client = t.context.app.client;

  await focusMain();
  await click('[data-test="OpenSettings"]');

  await focusChild();
  await click('[data-test="Settings"] [data-test="SideMenu"] [data-test="Stream"]');

  await setFormInput('[data-test="Form/Text/server"]', streamingServerURL);
  await setFormInput('[data-test="Form/Text/key"]', streamingKey);
  await click('[data-test="Done"]');

  await focusMain();
  await click('[data-test="StartStreamingButton"]');

  await client.$('[data-test="StartStreamingButton"][data-test-status="live"]').waitForExist({
    timeout: 10 * 1000,
  });
  t.pass();
});
