export function stringifyAppSourceSettings(settings: unknown): string {
  if (settings == null || settings === '') {
    return '';
  }

  if (typeof settings === 'string') {
    return settings;
  }

  try {
    const serialized = JSON.stringify(settings);
    return serialized == null ? '' : serialized;
  } catch {
    return '';
  }
}
