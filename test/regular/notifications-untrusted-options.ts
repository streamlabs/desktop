import test from 'ava';
import { pickUntrustedNotificationOptions } from '../../app/services/notifications/untrusted-options';

test('pickUntrustedNotificationOptions drops an attacker-supplied action', t => {
  const options = {
    message: 'Click me',
    action: {
      jsonrpc: '2.0',
      id: 1,
      method: 'downloadFile',
      params: { resource: 'MediaGalleryService', args: ['payload.dylib', { href: 'https://x' }] },
    },
  };

  const picked = pickUntrustedNotificationOptions(options);

  t.false('action' in picked);
  t.deepEqual(picked, { message: 'Click me' });
});

test('pickUntrustedNotificationOptions drops fields only internal callers may set', t => {
  const picked = pickUntrustedNotificationOptions({
    message: 'hi',
    id: 1,
    date: 0,
    singleton: true,
  });

  t.deepEqual(picked, { message: 'hi' });
});

test('pickUntrustedNotificationOptions keeps the documented fields', t => {
  const options = {
    message: 'hi',
    code: 'SOME_CODE',
    unread: false,
    type: 'WARNING',
    playSound: false,
    data: { a: 1 },
    subType: 'NEWS',
    lifeTime: -1,
    showTime: true,
  };

  t.deepEqual(pickUntrustedNotificationOptions(options), options);
});

test('pickUntrustedNotificationOptions ignores inherited properties', t => {
  const options = Object.create({ action: { method: 'initializeModule' } });
  options.message = 'hi';

  t.deepEqual(pickUntrustedNotificationOptions(options), { message: 'hi' });
});

test('pickUntrustedNotificationOptions tolerates non-object input', t => {
  t.deepEqual(pickUntrustedNotificationOptions(null), {} as any);
  t.deepEqual(pickUntrustedNotificationOptions('message'), {} as any);
});
