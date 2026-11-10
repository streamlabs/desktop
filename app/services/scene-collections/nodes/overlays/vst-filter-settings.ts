import { win32 } from 'path';

// Only a DLL file name may come from an overlay; sl-vst resolves it against the installed plugin directories.
export function vstPluginFileName(pluginPath: unknown): string {
  if (typeof pluginPath !== 'string') return '';

  const fileName = win32.basename(pluginPath);
  // eslint-disable-next-line no-control-regex
  if (!/\.dll$/i.test(fileName) || /[":\u0000-\u001f]/.test(fileName)) return '';

  return fileName;
}

export function sanitizeVstFilterSettings<T extends { [key: string]: unknown }>(settings: T): T {
  const sanitized: { [key: string]: unknown } = { ...settings };

  // chunk_data_path_v3 must stay non-empty or the saved preset is skipped on load
  for (const key of ['plugin_path', 'chunk_data_path_v3']) {
    if (key in sanitized) sanitized[key] = vstPluginFileName(sanitized[key]);
  }

  return sanitized as T;
}

// chunk_data_v2 and chunk_data embed the plugin path; sl-vst ignores them once chunk_data_path_v3 is set
export function sanitizeVstFilterSettingsForExport<T extends { [key: string]: unknown }>(
  settings: T,
): Partial<T> {
  const sanitized: { [key: string]: unknown } = sanitizeVstFilterSettings(settings);

  delete sanitized.chunk_data_v2;
  delete sanitized.chunk_data;

  return sanitized as Partial<T>;
}
