import test from 'ava';
import { stringifyAppSourceSettings } from '../../app/services/platform-apps/source-url';

test('stringifyAppSourceSettings serializes object settings as JSON', t => {
  const settings = {
    LONG_ACCESSTOKEN: 'token',
    intervals: '15',
  };

  t.is(
    stringifyAppSourceSettings(settings),
    '{"LONG_ACCESSTOKEN":"token","intervals":"15"}',
  );
});

test('stringifyAppSourceSettings preserves string settings', t => {
  const settings = '{"LONG_ACCESSTOKEN":"token","intervals":"15"}';

  t.is(stringifyAppSourceSettings(settings), settings);
});

test('stringifyAppSourceSettings returns empty string for empty settings', t => {
  t.is(stringifyAppSourceSettings(undefined), '');
  t.is(stringifyAppSourceSettings(null), '');
  t.is(stringifyAppSourceSettings(''), '');
});

test('stringifyAppSourceSettings returns empty string for non-serializable settings', t => {
  const settings: Record<string, unknown> = {};
  settings.self = settings;

  t.is(stringifyAppSourceSettings(settings), '');
});
