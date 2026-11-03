import test from 'ava';
import { parseFileVersion } from '../../app/util/msvc-runtime';

const SIGNATURE = 0xfeef04bd;
const STRUCT_VERSION = 0x00010000;

interface IFixedFileInfoFixture {
  major: number;
  minor: number;
  build: number;
  revision: number;
  signature?: number;
  structVersion?: number;
}

// A 52-byte VS_FIXEDFILEINFO: 13 little-endian DWORDs. The product version is set to
// something else, so a test fails if the parser reads it instead of the file version.
function fixedFileInfo(info: IFixedFileInfoFixture): Buffer {
  const struct = Buffer.alloc(52);
  struct.writeUInt32LE(info.signature ?? SIGNATURE, 0);
  struct.writeUInt32LE(info.structVersion ?? STRUCT_VERSION, 4);
  struct.writeUInt32LE(((info.major << 16) | info.minor) >>> 0, 8); // dwFileVersionMS
  struct.writeUInt32LE(((info.build << 16) | info.revision) >>> 0, 12); // dwFileVersionLS
  struct.writeUInt32LE((99 << 16) | 98, 16); // dwProductVersionMS
  struct.writeUInt32LE((97 << 16) | 96, 20); // dwProductVersionLS
  struct.writeUInt32LE(0x3f, 24); // dwFileFlagsMask
  struct.writeUInt32LE(0x40004, 32); // dwFileOS: VOS_NT_WINDOWS32
  struct.writeUInt32LE(2, 36); // dwFileType: VFT_DLL
  return struct;
}

// The start of a VS_VERSIONINFO resource as it appears in a PE file: wLength,
// wValueLength, wType, the UTF-16 key "VS_VERSION_INFO", and padding to a 32-bit
// boundary. VS_FIXEDFILEINFO follows it.
function versionInfoHeader(): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0x2c0, 0);
  header.writeUInt16LE(52, 2);
  header.writeUInt16LE(0, 4);
  const key = Buffer.from('VS_VERSION_INFO\0', 'utf16le');
  return Buffer.concat([header, key, Buffer.alloc(2)]);
}

// Filler bytes standing in for the rest of the DLL, without the signature bytes.
function filler(length: number): Buffer {
  const bytes = Buffer.alloc(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 31 + 7) % 0xbd;
  return bytes;
}

// A DLL-like buffer with the version resource after `prefixLength` bytes of filler.
function dllFixture(info: IFixedFileInfoFixture, prefixLength = 4096): Buffer {
  return Buffer.concat([
    filler(prefixLength),
    versionInfoHeader(),
    fixedFileInfo(info),
    filler(512),
  ]);
}

test('Reads a known file version', t => {
  const data = dllFixture({ major: 14, minor: 50, build: 35719, revision: 0 });

  t.is(parseFileVersion(data), '14.50.35719.0');
});

test('Reads an old file version from a resource at an unaligned offset', t => {
  // VS 2015 Update 3 runtime, the kind of msvcp140.dll that triggers the mtx_do_lock crash.
  const data = dllFixture({ major: 14, minor: 0, build: 24215, revision: 1 }, 4099);

  t.is(parseFileVersion(data), '14.0.24215.1');
});

test('Reads version parts that use the full 16 bits', t => {
  const data = dllFixture({ major: 0xffff, minor: 0x8000, build: 0xffff, revision: 0xfffe });

  t.is(parseFileVersion(data), '65535.32768.65535.65534');
});

test('Returns undefined when there is no signature', t => {
  t.is(parseFileVersion(filler(8192)), undefined);
  t.is(parseFileVersion(Buffer.alloc(0)), undefined);
});

test('Returns undefined when the record is truncated before the file version', t => {
  const full = dllFixture({ major: 14, minor: 50, build: 35719, revision: 0 }, 64);
  const signatureOffset = 64 + versionInfoHeader().length;

  // Signature, struct version and dwFileVersionMS, but only 3 bytes of dwFileVersionLS.
  t.is(parseFileVersion(full.subarray(0, signatureOffset + 15)), undefined);
  // Only the signature.
  t.is(parseFileVersion(full.subarray(0, signatureOffset + 4)), undefined);
  // The file version complete: the record can end right after it.
  t.is(parseFileVersion(full.subarray(0, signatureOffset + 16)), '14.50.35719.0');
});

test('Returns undefined when the only signature has an invalid struct version', t => {
  const data = dllFixture({
    major: 14,
    minor: 50,
    build: 35719,
    revision: 0,
    structVersion: 0x00020000,
  });

  t.is(parseFileVersion(data), undefined);
});

test('Skips a signature with an invalid struct version and reads the next valid one', t => {
  // Code or data can contain the signature bytes by chance before the real resource.
  const decoy = fixedFileInfo({
    major: 1,
    minor: 2,
    build: 3,
    revision: 4,
    structVersion: 0x12345678,
  });
  const data = Buffer.concat([
    filler(100),
    decoy,
    dllFixture({ major: 14, minor: 44, build: 35211, revision: 0 }),
  ]);

  t.is(parseFileVersion(data), '14.44.35211.0');
});
