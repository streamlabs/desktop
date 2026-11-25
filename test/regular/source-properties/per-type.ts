/**
 * Source Properties smoke + round trip per source type, for the source types whose properties
 * window is still rendered by the legacy Vue form (`SourcePropertiesDeprecated`). The same
 * file has to keep passing once those types move to the React `SourceProperties` window.
 *
 * Expected labels are derived from the OBS property descriptions returned by the API.
 * Not covered: `scene` sources (they need a second scene and are configured through a
 * different add flow), and hardware dependent types (dshow_input, decklink) that are React.
 */
import { useWebdriver, test } from '../../helpers/webdriver';
import { waitForDisplayed } from '../../helpers/modules/core';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';
import {
  addTestSource,
  closeProperties,
  getSourceFormProps,
  getSourceFormValues,
  getSourceType,
  openProperties,
} from '../../helpers/modules/source-properties';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({
  skipOnboarding: true,
  restartAppAfterEachTest: false,
  clearCollectionAfterEachTest: true,
});

interface ISpec {
  type: string;
  displayName: string;
  /** a bool property to flip for the round trip */
  toggle: string;
  windowsOnly: boolean;
  /** OBS properties that are not rendered with a `label` of their description */
  customLabels?: Record<string, string[]>;
}

const specs: ISpec[] = [
  { type: 'image_source', displayName: 'Image', toggle: 'unload', windowsOnly: false },
  { type: 'slideshow', displayName: 'Image Slide Show', toggle: 'loop', windowsOnly: false },
  {
    type: 'text_gdiplus',
    displayName: 'Text (GDI+)',
    toggle: 'antialiasing',
    windowsOnly: true,
    // the font property is rendered as three controls
    customLabels: { font: ['Use Google Font', 'Font Family', 'Font Style', 'Font Size'] },
  },
  {
    type: 'monitor_capture',
    displayName: 'Display Capture',
    toggle: 'capture_cursor',
    windowsOnly: true,
  },
  { type: 'window_capture', displayName: 'Window Capture', toggle: 'cursor', windowsOnly: true },
  {
    type: 'wasapi_input_capture',
    displayName: 'Audio Input Capture',
    toggle: 'use_device_timing',
    windowsOnly: true,
  },
  {
    type: 'wasapi_output_capture',
    displayName: 'Audio Output Capture',
    toggle: 'use_device_timing',
    windowsOnly: true,
  },
];

for (const spec of specs) {
  const testFn = spec.windowsOnly && process.platform !== 'win32' ? test.skip : test;

  testFn(`Source properties: ${spec.type}`, async t => {
    const name = `Props ${spec.type}`;
    await addTestSource(spec.displayName, name);
    t.is(await getSourceType(name), spec.type);

    // every visible OBS property is rendered with its description as a label
    const props = await getSourceFormProps(name);
    const visible = props.filter(p => p.visible && p.description);
    t.true(visible.length > 0, 'the source exposes visible properties');

    await openProperties(name);
    for (const prop of visible) {
      const labels = spec.customLabels?.[prop.name] || [prop.description];
      for (const label of labels) {
        await waitForDisplayed(`label=${label}`, { timeout: 5000 });
      }
    }

    // round trip of one setting
    const before = (await getSourceFormValues(name))[spec.toggle] as boolean;
    t.is(typeof before, 'boolean', `${spec.toggle} is a boolean`);
    await fillForm({ [spec.toggle]: !before });
    await closeProperties();

    t.is((await getSourceFormValues(name))[spec.toggle], !before);

    await openProperties(name);
    await assertFormContains({ [spec.toggle]: !before });
    await closeProperties();
  });
}
