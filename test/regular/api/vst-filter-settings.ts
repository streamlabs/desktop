import test from 'ava';
import {
  sanitizeVstFilterSettings,
  vstPluginFileName,
} from '../../../app/services/scene-collections/nodes/overlays/vst-filter-settings';

test('vstPluginFileName reduces full paths to the file name', t => {
  t.is(vstPluginFileName('C:\\Program Files/VSTPlugins//Foo.dll'), 'Foo.dll');
  t.is(vstPluginFileName('\\\\host@SSL\\DavWWWRoot\\Foo.dll'), 'Foo.dll');
  t.is(vstPluginFileName('/Library/Audio/Plug-Ins/VST/Foo.DLL'), 'Foo.DLL');
  t.is(vstPluginFileName('C:\\x\\..\\..\\Foo Bar.dll'), 'Foo Bar.dll');
});

test('vstPluginFileName leaves a bare name unchanged', t => {
  t.is(vstPluginFileName('Foo.dll'), 'Foo.dll');
});

test('vstPluginFileName rejects names that are not a plain DLL file name', t => {
  t.is(vstPluginFileName(undefined), '');
  t.is(vstPluginFileName(''), '');
  t.is(vstPluginFileName('C:\\x\\'), '');
  t.is(vstPluginFileName('C:\\x\\Foo.exe'), '');
  t.is(vstPluginFileName('Foo.dll:stream'), '');
  t.is(vstPluginFileName('Foo".dll'), '');
  t.is(vstPluginFileName('Foo\u0001.dll'), '');
});

test('sanitizeVstFilterSettings sanitizes paths and keeps preset data', t => {
  const settings = {
    plugin_path: 'C:\\Program Files/VSTPlugins//Foo.dll',
    chunk_data_path_v3: 'C:\\Program Files/VSTPlugins//Foo.dll',
    chunk_data_0_v3: 'AAAA',
    chunk_data_p_v3: 'BBBB',
    open_when_active_vst_settings: true,
  };

  t.deepEqual(sanitizeVstFilterSettings(settings), {
    ...settings,
    plugin_path: 'Foo.dll',
    chunk_data_path_v3: 'Foo.dll',
  });
  t.is(settings.plugin_path, 'C:\\Program Files/VSTPlugins//Foo.dll', 'input is not mutated');
});

test('sanitizeVstFilterSettings handles missing and empty plugin_path', t => {
  t.deepEqual(sanitizeVstFilterSettings({ chunk_data_0_v3: 'AAAA' }), { chunk_data_0_v3: 'AAAA' });
  t.deepEqual(sanitizeVstFilterSettings({ plugin_path: '' }), { plugin_path: '' });
});
