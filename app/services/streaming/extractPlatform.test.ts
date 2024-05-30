import { extractPlatform } from './extractPlatform';

describe('extractPlatform', () => {
  test.each([
    ['rtmp://a.b.c.d/', 'c'], // second level domain
    ['rtmp://1.2.3.4/', '1.2'], // first 2 numbers
    ['invalid', 'invalid'], // invalid URL: return original string
  ])(`%s -> %s`, (url, expected) => {
    expect(extractPlatform(url)).toBe(expected);
  });
});
