import { useWebdriver, test } from '../helpers/webdriver';
import { clickSceneTransitions, addScene } from '../helpers/modules/scenes';
import { getFormInput } from '../helpers/webdriver/forms';
import { dismissModal } from '../helpers/webdriver/modals';
import { assertFormContains, fillForm } from '../helpers/modules/forms';
import { click, clickButton, focusChild, focusMain } from '../helpers/modules/core';
import { getApiClient } from '../helpers/api-client';
import { ScenesService } from 'services/api/external-api/scenes/scenes';
import { TransitionsService } from 'services/api/external-api/transitions/transitions';

// Pass restartAppAfterEachTest to true to restart the app after each test.
// This will trigger a shutdown of the transition/video service and will confirm
// that the service shuts down cleanly without errors in the log.
// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

// TODO: Fix test to handle missing duration field
test.skip('Changing transition options', async t => {
  const app = t.context.app;
  const transitionType = 'Fade';
  const transitionDuration = 500;

  // We need at least 2 scenes to edit transitions
  await addScene('Other Scene');

  await focusMain();
  await clickSceneTransitions();
  await focusChild();
  await (await app.client.$('.icon-edit')).click();
  await fillForm({
    type: transitionType,
    duration: transitionDuration,
  });

  await dismissModal(t);
  await clickButton('Done');
  await focusMain();
  await clickSceneTransitions();
  await focusChild();

  await click('.icon-edit');

  t.true(
    await assertFormContains({
      type: transitionType,
      duration: transitionDuration,
    }),
  );
  t.pass();
});

test('Test creating transitions using apiClient', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const transitionsService = client.getResource<TransitionsService>('TransitionsService');

  // Create a scene and add a source so scene items are assigned to the video context
  const scene = scenesService.createScene('Shutdown Test Scene');
  t.assert(scene, 'Failed to create scene');
  const source = scene.createAndAddSource('Test Source', 'color_source');
  t.assert(source, 'Failed to create source');

  const transition = (transitionsService as any).createTransition(
    'fade_transition',
    'Test Fade Transition',
  );
  t.assert(transition, 'Failed to create transition');
});

test('Adding and removing transitions', async t => {
  const app = t.context.app;

  // We need at least 2 scenes to edit transitions
  await addScene('Other Scene');

  await focusMain();
  await clickSceneTransitions();
  await focusChild();
  await (await app.client.$('button=Add Transition')).click();
  await dismissModal(t);
  await (await app.client.$('.icon-trash')).click();
  await (await app.client.$('.icon-edit')).click();
  const title = await getFormInput(t, 'Name');
  t.true(title === 'New Transition');
});

test.skip('Changing connections', async t => {
  const app = t.context.app;
  const connectionBegin = 'Other Scene';
  const connectionTransition = 'New Transition';
  const connectionEnd = 'Scene';

  // We need at least 2 scenes to edit transitions
  await addScene('Other Scene');

  await focusMain();
  await clickSceneTransitions();
  await focusChild();
  await (await app.client.$('button=Add Transition')).click();
  await dismissModal(t);
  await (await app.client.$('span=Connections')).click();
  await (await app.client.$('button=Add Connection')).click();
  await fillForm({
    from: connectionBegin,
    transition: connectionTransition,
    to: connectionEnd,
  });
  await (await t.context.app.client.$('button=OK')).click();
  await focusMain();
  await clickSceneTransitions();
  await focusChild();

  await (await app.client.$('span=Connections')).click();
  await (await app.client.$('.icon-edit')).click();

  t.true(
    await assertFormContains({
      from: connectionBegin,
      transition: connectionTransition,
      to: connectionEnd,
    }),
  );
});

test('Showing redudant connection warning', async t => {
  const app = t.context.app;

  // We need at least 2 scenes to edit transitions
  await addScene('Other Scene');

  await focusMain();
  await clickSceneTransitions();
  await focusChild();
  await (await app.client.$('button=Add Transition')).click();
  await dismissModal(t);
  await (await app.client.$('span=Connections')).click();
  await (await app.client.$('button=Add Connection')).click();
  await dismissModal(t);
  await (await app.client.$('button=Add Connection')).click();
  await dismissModal(t);

  await (await app.client.$('.icon-information')).waitForDisplayed();
  t.pass();
});
