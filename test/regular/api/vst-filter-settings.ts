import test from 'ava';
import {
  sanitizeVstFilterSettings,
  sanitizeVstFilterSettingsForExport,
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

  t.deepEqual(sanitizeVstFilterSettings(settings, 'win32'), {
    ...settings,
    plugin_path: 'Foo.dll',
    chunk_data_path_v3: 'Foo.dll',
  });
  t.is(settings.plugin_path, 'C:\\Program Files/VSTPlugins//Foo.dll', 'input is not mutated');
});

test('sanitizeVstFilterSettings handles missing and empty plugin_path', t => {
  t.deepEqual(sanitizeVstFilterSettings({ chunk_data_0_v3: 'AAAA' }, 'win32'), {
    chunk_data_0_v3: 'AAAA',
  });
  t.deepEqual(sanitizeVstFilterSettings({ plugin_path: '' }, 'win32'), { plugin_path: '' });
});

test('sanitizeVstFilterSettings leaves macOS bundle paths unchanged', t => {
  const settings = {
    plugin_path: '/Library/Audio/Plug-Ins/VST/Foo.vst',
    chunk_data_path_v3: '/Library/Audio/Plug-Ins/VST/Foo.vst',
    chunk_data_0_v3: 'AAAA',
  };

  t.deepEqual(sanitizeVstFilterSettings(settings, 'darwin'), settings);
});

test('sanitizeVstFilterSettingsForExport drops legacy chunk keys that embed the path', t => {
  const settings = {
    plugin_path: 'C:\\Users\\me\\Foo.dll',
    chunk_data_path_v3: 'C:\\Users\\me\\Foo.dll',
    chunk_data_0_v3: 'AAAA',
    chunk_data_v2: 'C:\\Users\\me\\Foo.dll|AAAA',
    chunk_data: 'C:\\Users\\me\\Foo.dll|BBBB',
  };

  t.deepEqual(sanitizeVstFilterSettingsForExport(settings), {
    plugin_path: 'Foo.dll',
    chunk_data_path_v3: 'Foo.dll',
    chunk_data_0_v3: 'AAAA',
  });
});
