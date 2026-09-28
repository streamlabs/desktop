import { useWebdriver, test } from '../helpers/webdriver';
import { clickSceneTransitions, addScene } from '../helpers/modules/scenes';
import { getFormInput } from '../helpers/webdriver/forms';
import { dismissModal } from '../helpers/webdriver/modals';
import { FormMonkey } from '../helpers/form-monkey';
import { assertFormContains, fillForm } from '../helpers/modules/forms';
import { click, clickButton, focusChild, focusMain } from '../helpers/modules/core';

useWebdriver({
  restartAppAfterEachTest: false,
  clearCollectionAfterEachTest: true,
});

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

test('Adding and removing transitions', async t => {
  const app = t.context.app;

  // We need at least 2 scenes to edit transitions
  await addScene('Other Scene');

  await focusMain();
  await clickSceneTransitions();
  await focusChild();
  await (await app.client.$('button=Add Transition')).click();
  await clickButton('Done');
  await (await app.client.$('.icon-trash')).click();
  await (await app.client.$('.icon-edit')).click();
  const title = await getFormInput(t, 'Name');
  t.true(title === 'New Transition');
});

test('Cancelling a new transition discards it', async t => {
  const app = t.context.app;

  // We need at least 2 scenes to edit transitions
  await addScene('Other Scene');

  await focusMain();
  await clickSceneTransitions();
  await focusChild();
  const rowCount = async () => (await app.client.$$('.ant-table-row')).length;
  await (await app.client.$('.ant-table-row')).waitForExist({ timeout: 5000 });
  const before = await rowCount();

  // Add Transition creates the transition immediately; leaving the editor without Done
  // (Escape, the X, the backdrop) has to remove it again once the modal has closed
  await (await app.client.$('button=Add Transition')).click();
  await (await app.client.$('.ant-modal-content')).waitForDisplayed({ timeout: 5000 });
  await dismissModal(t);
  await app.client.waitUntil(async () => (await rowCount()) === before, {
    timeout: 5000,
    timeoutMsg: 'the cancelled transition is still listed',
  });
  t.is(await rowCount(), before, 'cancelling should discard the new transition');

  // The existing transitions survive, and keeping one with Done still adds a row
  await (await app.client.$('button=Add Transition')).click();
  await clickButton('Done');
  t.is(await rowCount(), before + 1, 'confirming should keep the new transition');
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
