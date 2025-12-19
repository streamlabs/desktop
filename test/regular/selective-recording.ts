import { readdir } from 'fs-extra';
import { test, useWebdriver } from '../helpers/webdriver';
import { addSource } from '../helpers/modules/sources';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
} from '../helpers/modules/settings/settings';
import { focusMain } from '../helpers/modules/core';
import { sleep } from '../helpers/sleep';
import { startRecording, stopRecording } from '../helpers/modules/streaming';

useWebdriver();

test('Selective Recording', async t => {
  const sourceType = 'Browser Source';
  const sourceName = `Example ${sourceType}`;
  const { client } = t.context.app;
  const tmpDir = await setTemporaryRecordingPath();

  // set lower resolution for better performance in CI
  await setOutputResolution('100x100');

  // Add a browser source
  await addSource(sourceType, sourceName);

  // Toggle selective recording
  await focusMain();
  await (await client.$('[data-name=sourcesControls] .icon-smart-record')).click();

  // Check that selective recording icon is active
  await (await client.$('.icon-smart-record.active')).waitForExist();

  // Check that browser source has a selective recording toggle
  t.true(await (await client.$('[data-role=source] .icon-smart-record')).isExisting());

  // Cycle selective recording mode on browser source
  await (await client.$('[data-role=source] .icon-smart-record')).click();

  // Check that source is set to stream only
  await (await client.$('[data-role=source] .icon-broadcast')).waitForExist();

  // Cycle selective recording mode to record only
  await (await client.$('[data-role=source] .icon-broadcast')).click();

  // Check that source is set to record only
  await (await client.$('[data-role=source] .icon-studio')).waitForExist();

  // Start recording and wait
  await startRecording();
  // Record for 2s to prevent the recording from accidentally having the same key
  await sleep(2000);
  await stopRecording();

  // Check that file exists
  const files = await readdir(tmpDir);
  t.is(files.length, 1);
});
