import { FormMonkey } from '../helpers/form-monkey';
import { useWebdriver, test } from '../helpers/webdriver';
import {
  addSource,
  clickRemoveSource,
  clickSourceProperties,
  selectSource,
  openRenameWindow,
  waitForSourceExist,
} from '../helpers/modules/sources';
import {
  click,
  clickButton,
  focusChild,
  focusMain,
  select,
  waitForDisplayed,
} from '../helpers/modules/core';

useWebdriver({ restartAppAfterEachTest: false });

test('Create/Remove Color Source and view Source Properties', async t => {
  const sourceName = 'Color Source';

  await addSource('Color Block', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  await waitForDisplayed('label=Color');
  await waitForDisplayed('label=Width');
  await waitForDisplayed('label=Height');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Image Source and view Source Properties', async t => {
  const sourceName = 'Image Source';
  await addSource('Image', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  await waitForDisplayed('label=Image File');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Browser Source and view Source Properties', async t => {
  const sourceName = 'Browser Source';

  await addSource('Browser Source', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();

  await waitForDisplayed('label=URL');
  await waitForDisplayed('label=Width');
  await waitForDisplayed('label=Height');

  await click('span=Use custom frame rate');

  await waitForDisplayed('label=FPS');
  await waitForDisplayed('label=Custom CSS');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Media Source and view Source Properties', async t => {
  const sourceName = 'Media Source';

  await addSource('Media File', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();

  await waitForDisplayed('label=Local File');
  await waitForDisplayed('label=Speed');
  await waitForDisplayed('label=YUV Color Range');

  await click('span=Local File');
  await waitForDisplayed('label=Network Buffering');
  await waitForDisplayed('label=Input');
  await waitForDisplayed('label=Input Format');
  await waitForDisplayed('label=Reconnect Delay');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Image Slideshow and view Source Properties', async t => {
  const sourceName = 'Image Slide Show';

  await addSource('Image Slide Show', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  await waitForDisplayed('label=Visibility Behavior');
  await waitForDisplayed('label=Slide Mode');
  await waitForDisplayed('label=Transition');
  await waitForDisplayed('label=Time Between Slides');
  await waitForDisplayed('label=Transition Speed');
  await waitForDisplayed('label=Bounding Size/Aspect Ratio');
  await waitForDisplayed('label=Image Files');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Text Source and view Source Properties', async t => {
  const sourceName = 'Text Source';

  await addSource('Text (GDI+)', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();

  await waitForDisplayed('label=Use Google Font');
  await waitForDisplayed('label=Font Family');
  await waitForDisplayed('label=Font Style');
  await waitForDisplayed('label=Font Size');
  await waitForDisplayed('label=Text');

  await (await (await select('[data-name=read_from_file')).$('[type=checkbox]')).click();

  await waitForDisplayed('label=Text File (UTF-8)');
  await waitForDisplayed('label=Text Transform');
  await waitForDisplayed('label=Color');
  await waitForDisplayed('label=Opacity');

  await (await (await select('[data-name=gradient')).$('[type=checkbox]')).click();

  await waitForDisplayed('label=Gradient Color');
  await waitForDisplayed('label=Gradient Opacity');
  await waitForDisplayed('label=Gradient Direction');

  await waitForDisplayed('label=Background Color');
  await waitForDisplayed('label=Background Opacity');
  await waitForDisplayed('label=Alignment');
  await waitForDisplayed('label=Vertical Alignment');

  await (await (await select('[data-name=outline')).$('[type=checkbox]')).click();

  await waitForDisplayed('label=Outline Size');
  await waitForDisplayed('label=Outline Color');
  await waitForDisplayed('label=Outline Opacity');

  await (await (await select('[data-name=chatlog')).$('[type=checkbox]')).click();

  await waitForDisplayed('label=Chatlog Line Limit');

  await (await (await select('[data-name=extents')).$('[type=checkbox]')).click();

  await waitForDisplayed('label=Width');
  await waitForDisplayed('label=Height');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Display Capture and view Source Properties', async t => {
  const sourceName = 'Display Capture';

  await addSource('Display Capture', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  // this feature is in v1.3.0, uncomment once it is fully shipped
  // t.true(await (await app.client.$('label=Capture Method')).isExisting());

  await waitForDisplayed('label=Display');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Window Capture and view Source Properties', async t => {
  const sourceName = 'Window Capture';

  await addSource('Window Capture', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();

  await waitForDisplayed('label=Window');
  await waitForDisplayed('label=Capture Method');
  await waitForDisplayed('label=Window Match Priority');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Game Capture and view Source Properties', async t => {
  const sourceName = 'Game Capture';

  await addSource('Game Capture', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  await waitForDisplayed('label=Mode');
  await waitForDisplayed('label=Hook Rate');

  await waitForDisplayed('span=Сustomize placeholder');
  await click('span=Сustomize placeholder');
  await waitForDisplayed('label=Placeholder Image');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Video Capture Device and view Source Properties', async t => {
  const sourceName = 'Video Capture';

  await addSource('Video Capture', sourceName);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  await waitForDisplayed('label=Device');
  await waitForDisplayed('label=Resolution/FPS Type');
  await waitForDisplayed('label=Resolution');
  await waitForDisplayed('label=FPS');
  await waitForDisplayed('label=Video Format');
  await waitForDisplayed('label=Color Space');
  await waitForDisplayed('label=Color Range');
  await waitForDisplayed('label=Buffering');
  await waitForDisplayed('label=Audio Output Mode');

  // this test fails on CI for some reason, investigating
  // await (await app.client.$('[data-name=use_custom_audio_device] input')).click();
  // t.true(await (await app.client.$('label=Audio Device')).isExisting());

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Audio Input Capture and view Source Properties', async t => {
  const sourceName = 'Audio Input Capture';

  await addSource('Audio Input Capture', sourceName, true, true);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  await waitForDisplayed('label=Device');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Create/Remove Audio Output Capture and view Source Properties', async t => {
  const sourceName = 'Audio Output Capture';

  await addSource('Audio Output Capture', sourceName, true, true);
  await focusMain();

  await selectSource(sourceName);
  await clickSourceProperties(sourceName);

  await focusChild();
  await waitForDisplayed('label=Device');

  await focusMain();
  await selectSource(sourceName);
  await clickRemoveSource(sourceName);
  await waitForSourceExist(sourceName, true);
  t.pass();
});

test('Rename source', async t => {
  const sourceName = 'MyColorSource1';
  const newSourceName = 'MyColorSource2';

  await addSource('Color Block', sourceName);

  await openRenameWindow(sourceName);

  await focusChild();
  const form = new FormMonkey(t);
  await form.setInputValue('[data-name=sourceName]', newSourceName);
  await clickButton('Done');

  await focusMain();
  await waitForSourceExist(newSourceName);
  t.pass();
});
