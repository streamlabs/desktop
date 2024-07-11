import { convertPresetPath, revertPresetPath } from './sources-util';

jest.mock('electron', () => ({}));
jest.mock('@electron/remote', () => ({}));
jest.mock('./sources', () => ({}));

const DUMMY_BASE_PATH = 'c:\\Users\\user';

const ABSOLUTES = ['\\', '\\\\', 'c:\\', 'd:\\', 'c:\\Users\\another', '\\\\server\\file'];

const INNER_RELATIVES = ['.', 'c:cwd/another', 'cwd/another'];

const OUTER_RELATIVES = ['..', '../yay'];

test('convertPresetPath: as-is', () => {
  for (const p of ABSOLUTES) {
    expect(convertPresetPath(p, DUMMY_BASE_PATH)).toBe(p);
  }
  for (const p of OUTER_RELATIVES) {
    expect(convertPresetPath(p, DUMMY_BASE_PATH)).toBe(p);
  }
});

test('convertPresetPath: convert', () => {
  expect(convertPresetPath('file', DUMMY_BASE_PATH)).toBe('c:\\Users\\user\\file');
  expect(convertPresetPath('./file', DUMMY_BASE_PATH)).toBe('c:\\Users\\user\\file');
  expect(convertPresetPath('c:cwd/another', DUMMY_BASE_PATH)).toBe('c:\\Users\\user\\cwd\\another');
  expect(convertPresetPath('cwd/another', DUMMY_BASE_PATH)).toBe('c:\\Users\\user\\cwd\\another');
});

test('revertPresetPath: as-is', () => {
  for (const p of ABSOLUTES) {
    expect(revertPresetPath(p, DUMMY_BASE_PATH)).toBe(p);
  }
  for (const p of OUTER_RELATIVES) {
    expect(revertPresetPath(p, DUMMY_BASE_PATH)).toBe(p);
  }
});

test('revertPresetPath: revert', () => {
  expect(revertPresetPath('c:\\Users\\user\\file', DUMMY_BASE_PATH)).toBe('file');
  expect(revertPresetPath('c:\\Users\\user\\cwd\\another', DUMMY_BASE_PATH)).toBe('cwd\\another');
});
