/**
 * Framework-agnostic coverage of every OBS property input type that the built-in sources expose.
 *
 * Each test sets values through the Source Properties UI, closes the window, reopens it and
 * verifies the persisted values both through the API and in the UI again.
 *
 * Only `label=`, `[data-name]`, `[data-role]`/`[data-type]` hooks and API reads are used, so the
 * same file must pass against the Vue (`SourcePropertiesDeprecated`) and React implementations.
 *
 * Not covered: OBS_PROPERTY_DOUBLE/FLOAT, BITMASK and OBS_INPUT_RESOLUTION_LIST are only exposed
 * by hardware dependent sources (dshow_input, decklink) that can't be loaded in CI.
 * OBS_PROPERTY_BUTTON is only used by plugin sources.
 */
import * as path from 'path';
import { useWebdriver, test } from '../../helpers/webdriver';
import { getClient, waitForDisplayed } from '../../helpers/modules/core';
import { assertFormContains, fillForm, useForm } from '../../helpers/modules/forms';
import {
  addTestSource,
  closeProperties,
  getSourceFormProp,
  getSourceFormValues,
  openProperties,
  setSourceFormValues,
} from '../../helpers/modules/source-properties';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({
  skipOnboarding: true,
  restartAppAfterEachTest: false,
  clearCollectionAfterEachTest: true,
});

// text_gdiplus is windows-only
const winTest = process.platform === 'win32' ? test : test.skip;

// Sliders, numbers and colors debounce their change events
const SETTLE_MS = 1000;

const IMAGE_A = path.resolve(__dirname, '../../../../media/images/16x9.png');
const IMAGE_B = path.resolve(__dirname, '../../../../shared-resources/capture-placeholder.png');

async function elementExists(selector: string) {
  return getClient().$(selector).isExisting();
}

/**
 * Picks an option of a list property that is not the current one
 */
async function pickOtherOption(sourceName: string, propName: string) {
  const prop = await getSourceFormProp(sourceName, propName);
  const other = prop.options.find(opt => opt.value !== prop.value && opt.description !== '');
  if (!other) throw new Error(`No alternative option for "${propName}"`);
  return other;
}

// TEXT (single line)

test('OBS input: text', async t => {
  // ffmpeg_source `ffmpeg_options` is a single line OBS_PROPERTY_TEXT that is always visible
  const name = 'Media Text';
  await addTestSource('Media File', name);
  t.false((await getSourceFormProp(name, 'ffmpeg_options')).multiline);

  await openProperties(name);
  await fillForm({ ffmpeg_options: 'key=value' });
  await sleep(SETTLE_MS);
  await closeProperties();

  t.is((await getSourceFormValues(name)).ffmpeg_options, 'key=value');

  await openProperties(name);
  await assertFormContains({ ffmpeg_options: 'key=value' });
  await closeProperties();
});

// TEXT (multiline)

winTest('OBS input: multiline text', async t => {
  const name = 'Multiline Text';
  await addTestSource('Text (GDI+)', name);
  const text = 'Line one Line two';
  t.true((await getSourceFormProp(name, 'text')).multiline);

  await openProperties(name);
  t.true(await elementExists('[data-name="text"][data-role=input]'));
  await fillForm({ text });
  await sleep(SETTLE_MS);
  await closeProperties();

  t.is((await getSourceFormValues(name)).text, text);

  await openProperties(name);
  await assertFormContains({ text });
  await closeProperties();
});

// BOOL

test('OBS input: bool', async t => {
  const name = 'Bool Source';
  await addTestSource('Image Slide Show', name);
  const before = await getSourceFormValues(name);

  await openProperties(name);
  await fillForm({ loop: !before.loop, randomize: !before.randomize });
  await closeProperties();

  const after = await getSourceFormValues(name);
  t.is(after.loop, !before.loop);
  t.is(after.randomize, !before.randomize);

  await openProperties(name);
  await assertFormContains({ loop: !before.loop, randomize: !before.randomize });
  await closeProperties();
});

test('OBS input: bool shows and hides dependent fields', async t => {
  const name = 'Bool Dependent';
  await addTestSource('Browser Source', name);

  await openProperties(name);
  t.false(await elementExists('[data-name=fps]'));
  await fillForm({ fps_custom: true });
  await waitForDisplayed('label=FPS');
  t.true(await elementExists('[data-name=fps]'));
  await closeProperties();

  t.true((await getSourceFormValues(name)).fps_custom as boolean);
});

// LIST

test('OBS input: list', async t => {
  const name = 'List Source';
  await addTestSource('Image Slide Show', name);
  const transition = await pickOtherOption(name, 'transition');
  const mode = await pickOtherOption(name, 'slide_mode');
  const allTransitions = (await getSourceFormProp(name, 'transition')).options.map(
    o => o.description,
  );

  await openProperties(name);
  // lists are set by their visible label
  await fillForm({ transition: transition.description, slide_mode: mode.description });
  await closeProperties();

  const values = await getSourceFormValues(name);
  t.is(values.transition, transition.value);
  t.is(values.slide_mode, mode.value);

  await openProperties(name);
  await assertFormContains({ transition: transition.description, slide_mode: mode.description });
  // all OBS options are offered
  const options = await useForm().getInputListValues('transition');
  t.deepEqual(options.map(o => o.label).sort(), allTransitions.slice().sort());
  await closeProperties();
});

// INT

test('OBS input: int', async t => {
  const name = 'Int Source';
  await addTestSource('Image Slide Show', name);

  await openProperties(name);
  await fillForm({ slide_time: 4500, transition_speed: 900 });
  await sleep(SETTLE_MS);
  await closeProperties();

  const values = await getSourceFormValues(name);
  t.is(values.slide_time, 4500);
  t.is(values.transition_speed, 900);

  await openProperties(name);
  await assertFormContains({ slide_time: 4500, transition_speed: 900 });
  await closeProperties();
});

test('OBS input: int (browser source size)', async t => {
  const name = 'Int Browser';
  await addTestSource('Browser Source', name);

  await openProperties(name);
  await fillForm({ width: 1280, height: 720 });
  await sleep(SETTLE_MS);
  await closeProperties();

  const values = await getSourceFormValues(name);
  t.is(values.width, 1280);
  t.is(values.height, 720);

  await openProperties(name);
  await assertFormContains({ width: 1280, height: 720 });
  await closeProperties();
});

// SLIDER

test('OBS input: slider', async t => {
  // ffmpeg_source `speed_percent` is a 1..200 slider on every platform
  const name = 'Slider Source';
  await addTestSource('Media File', name);

  await openProperties(name);
  const slider: any = await useForm().getInput('speed_percent');
  t.truthy(slider, 'speed_percent slider is rendered');
  t.true(await slider.setValueViaBox(150), 'slider has a number box');
  await sleep(SETTLE_MS);
  await closeProperties();

  t.is((await getSourceFormValues(name)).speed_percent, 150);

  await openProperties(name);
  await assertFormContains({ speed_percent: 150 });
  await closeProperties();
});

winTest('OBS input: slider (text opacity)', async t => {
  const name = 'Opacity Source';
  await addTestSource('Text (GDI+)', name);

  await openProperties(name);
  const slider: any = await useForm().getInput('opacity');
  t.true(await slider.setValueViaBox(42), 'slider has a number box');
  await sleep(SETTLE_MS);
  await closeProperties();

  t.is((await getSourceFormValues(name)).opacity, 42);

  await openProperties(name);
  await assertFormContains({ opacity: 42 });
  await closeProperties();
});

// COLOR

winTest('OBS input: color', async t => {
  const name = 'Color Text';
  await addTestSource('Text (GDI+)', name);
  const before = (await getSourceFormValues(name)).color as number;

  await openProperties(name);
  await fillForm({ color: '#112233' });
  await sleep(SETTLE_MS);
  await closeProperties();

  // OBS stores colors as ABGR, the red channel is the lowest byte
  const after = (await getSourceFormValues(name)).color as number;
  t.not(after, before);
  t.is(after & 0xffffff, 0x332211);

  await openProperties(name);
  const fields = (await useForm().readFields()) as Record<string, string>;
  t.regex(String(fields.color).toLowerCase(), /^#112233/);
  await closeProperties();
});

// PATH / FILE

test('OBS input: file path', async t => {
  const name = 'File Image';
  await addTestSource('Image', name);

  // native file dialogs can't be automated, so the path is set through the API and the UI
  // must render it, and must still show it after the window is reopened
  await setSourceFormValues(name, { file: IMAGE_A });
  await openProperties(name);
  await waitForDisplayed('label=Image File');
  t.true(await elementExists('[data-name=file]'));
  await assertFormContains({ file: IMAGE_A });
  await closeProperties();

  await setSourceFormValues(name, { file: IMAGE_B });
  await openProperties(name);
  await assertFormContains({ file: IMAGE_B });
  await closeProperties();
  t.is((await getSourceFormValues(name)).file, IMAGE_B);
});

// FONT

winTest('OBS input: font', async t => {
  const name = 'Font Text';
  await addTestSource('Text (GDI+)', name);
  const before = (await getSourceFormValues(name)).font as any;

  await openProperties(name);
  await waitForDisplayed('label=Font Family');
  await waitForDisplayed('label=Font Style');
  await waitForDisplayed('label=Font Size');
  const form = useForm();

  // font families load asynchronously
  let families: { label: string }[] = [];
  await getClient().waitUntil(
    async () => {
      families = await form.getInputListValues('font_face');
      return families.length > 0;
    },
    { timeout: 15000, interval: 500, timeoutMsg: 'Font families were not loaded' },
  );
  const preferred = families.find(
    opt =>
      opt.label !== before.face && /^(Verdana|Tahoma|Courier New|Times New Roman)$/.test(opt.label),
  );
  const newFamily = (preferred || families.find(opt => opt.label !== before.face)).label;

  await fillForm({ font_face: newFamily });
  await sleep(SETTLE_MS);
  await closeProperties();

  t.is(((await getSourceFormValues(name)).font as any).face, newFamily);

  // the size is changed through the API (preset sliders can't be driven reliably) and has to
  // be rendered by the UI afterwards
  const font = (await getSourceFormValues(name)).font as any;
  await setSourceFormValues(name, { font: { ...font, size: 48 } });
  await openProperties(name);
  await assertFormContains({ font_face: newFamily, font_size: 48 });
  await closeProperties();
  t.is(((await getSourceFormValues(name)).font as any).size, 48);
});

// EDITABLE LIST

test('OBS input: editable list', async t => {
  const name = 'Slides';
  await addTestSource('Image Slide Show', name);

  await openProperties(name);
  await waitForDisplayed('label=Image Files');
  t.true(await elementExists('[data-name=files]'));
  t.deepEqual(((await useForm().readFields()) as any).files, []);
  await closeProperties();

  // native file dialogs can't be automated, add the items through the API
  await setSourceFormValues(name, { files: [{ value: IMAGE_A }, { value: IMAGE_B }] });

  await openProperties(name);
  const text = await getClient().$('[data-name=files]').getText();
  t.true(text.includes(path.basename(IMAGE_A)), `list shows ${path.basename(IMAGE_A)}`);
  t.true(text.includes(path.basename(IMAGE_B)), `list shows ${path.basename(IMAGE_B)}`);
  await closeProperties();

  const files = (await getSourceFormValues(name)).files as { value: string }[];
  t.deepEqual(
    files.map(f => f.value),
    [IMAGE_A, IMAGE_B],
  );
});
