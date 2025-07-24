import { useWebdriver, test } from '../helpers/webdriver';
import { addFilter, openFiltersWindow, removeFilter } from '../helpers/modules/filters';
import { addSource } from '../helpers/modules/sources';
import { focusChild, isDisplayed, waitForDisplayed } from '../helpers/modules/core';

useWebdriver({
  skipOnboarding: true,
  restartAppAfterEachTest: false,
  clearCollectionAfterEachTest: true,
});

test('Adding and removing a Color Correction filter', async t => {
  const sourceName = 'Color Source';
  const filterName = 'Color Correction';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Gamma');
  await waitForDisplayed('label=Contrast');
  await waitForDisplayed('label=Brightness');
  await waitForDisplayed('label=Saturation');
  await waitForDisplayed('label=Hue Shift');
  await waitForDisplayed('label=Opacity');
  await waitForDisplayed('label=Color');

  await removeFilter(sourceName, filterName);
  await openFiltersWindow(sourceName);

  t.false(await isDisplayed('label=Gamma'));
});

test('Adding and removing a Image Mask filter', async t => {
  const sourceName = 'Color Source 2';
  const filterName = 'Image Mask/Blend';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Type');
  await waitForDisplayed('label=Path');
  await waitForDisplayed('label=Color');
  await waitForDisplayed('label=Opacity');
  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Crop Pad filter', async t => {
  const sourceName = 'Color Source 3';
  const filterName = 'Crop/Pad';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Left');
  await waitForDisplayed('label=Top');
  await waitForDisplayed('label=Right');
  await waitForDisplayed('label=Bottom');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Scaling aspect filter', async t => {
  const sourceName = 'Color Source 4';
  const filterName = 'Scaling/Aspect Ratio';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Scale Filtering');
  await waitForDisplayed('label=Resolution');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Scroll filter', async t => {
  const sourceName = 'Color Source 5';
  const filterName = 'Scroll';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Horizontal Speed');
  await waitForDisplayed('label=Vertical Speed');
  await waitForDisplayed('label=Limit Width');
  await waitForDisplayed('label=Limit Height');
  t.pass();
});

test('Adding and removing a Render Delay filter', async t => {
  const sourceName = 'Color Source 6';
  const filterName = 'Render Delay';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();
  await isDisplayed('label=Delay');
  t.pass();
});

test('Adding and removing a Color Key filter', async t => {
  const sourceName = 'Color Source 7';
  const filterName = 'Color Key';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Key Color Type');
  await waitForDisplayed('label=Similarity (1-1000)');
  await waitForDisplayed('label=Smoothness (1-1000)');
  await waitForDisplayed('label=Opacity');
  await waitForDisplayed('label=Contrast');
  await waitForDisplayed('label=Brightness');
  await waitForDisplayed('label=Gamma');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a LUT filter', async t => {
  const sourceName = 'Color Source 8';
  const filterName = 'Apply LUT';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Path');
  await waitForDisplayed('label=Amount');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Sharpen filter', async t => {
  const sourceName = 'Color Source 9';
  const filterName = 'Sharpen';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Sharpness');
  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Chroma Key filter', async t => {
  const sourceName = 'Color Source 10';
  const filterName = 'Chroma Key';

  await addSource('Color Block', sourceName);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Similarity (1-1000)');
  await waitForDisplayed('label=Smoothness (1-1000)');
  await waitForDisplayed('label=Key Color Spill Reduction (1-1000)');
  await waitForDisplayed('label=Opacity');
  await waitForDisplayed('label=Contrast');
  await waitForDisplayed('label=Brightness');
  await waitForDisplayed('label=Gamma');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Invert Polarity filter', async t => {
  const sourceName = 'Audio Input Capture';
  const filterName = 'Invert Polarity';

  await addSource('Audio Input Capture', sourceName, true, true);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('div=No settings are available for this filter');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Gain filter', async t => {
  const sourceName = 'Audio Input Capture 1';
  const filterName = 'Gain';

  await addSource('Audio Input Capture', sourceName, true, true);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Gain');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Noise Suppression filter', async t => {
  const sourceName = 'Audio Input Capture 2';
  const filterName = 'Noise Suppression';

  await addSource('Audio Input Capture', sourceName, true, true);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Method');
  await waitForDisplayed('label=Suppression Level');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Noise Gate filter', async t => {
  const sourceName = 'Audio Input Capture 3';
  const filterName = 'Noise Gate';

  await addSource('Audio Input Capture', sourceName, true, true);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Close Threshold');
  await waitForDisplayed('label=Open Threshold');
  await waitForDisplayed('label=Attack Time');
  await waitForDisplayed('label=Hold Time');
  await waitForDisplayed('label=Release Time');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Compressor filter', async t => {
  const sourceName = 'Audio Input Capture 4';
  const filterName = 'Compressor';

  await addSource('Audio Input Capture', sourceName, true, true);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Ratio');
  await waitForDisplayed('label=Threshold');
  await waitForDisplayed('label=Attack');
  await waitForDisplayed('label=Release');
  await waitForDisplayed('label=Output Gain');
  await waitForDisplayed('label=Sidechain/Ducking Source');

  await removeFilter(sourceName, filterName);
  t.pass();
});

test('Adding and removing a Limiter filter', async t => {
  const sourceName = 'Audio Input Capture 5';
  const filterName = 'Limiter';

  await addSource('Audio Input Capture', sourceName, true, true);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Threshold');
  await waitForDisplayed('label=Release');

  await removeFilter(sourceName, filterName);
  await openFiltersWindow(sourceName);
  t.pass();
});

test('Adding and removing an Expander filter', async t => {
  const sourceName = 'Audio Input Capture 6';
  const filterName = 'Expander';

  await addSource('Audio Input Capture', sourceName, true, true);
  await addFilter(sourceName, filterName, filterName);
  await openFiltersWindow(sourceName);
  await focusChild();

  await waitForDisplayed('label=Presets');
  await waitForDisplayed('label=Ratio');
  await waitForDisplayed('label=Threshold');
  await waitForDisplayed('label=Attack');
  await waitForDisplayed('label=Release');
  await waitForDisplayed('label=Output Gain');
  await waitForDisplayed('label=Detection');

  await removeFilter(sourceName, filterName);
  t.pass();
});
