/**
 * build-xlsx.js
 *
 * Assembles the license audit into a single multi-tab Excel workbook:
 *   scripts/license-audit.xlsx
 *
 * Tabs:
 *   1. Summary        — totals + license distribution
 *   2. JS packages    — the shipped JS surface (scripts/license-audit.json)
 *   3. Native modules — C++/native + git deps (scripts/native-license-todo.csv)
 *   4. Needs review   — JS packages with UNKNOWN license
 *
 * An .xlsx is a ZIP of OOXML parts, so it is built with `archiver` (already a
 * production dependency) — no new packages required. Strings are written inline
 * (t="inlineStr") to avoid a sharedStrings table. Read-only w.r.t. audit inputs.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = __dirname;
const jsRecords = require('./license-audit.json');

// ---- tiny CSV parser (handles quoted fields with commas/quotes) ------------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && r.some(v => v !== ''));
}

const nativeRows = parseCsv(fs.readFileSync(path.join(DIR, 'native-license-todo.csv'), 'utf8'));
const nativeDepsRows = parseCsv(fs.readFileSync(path.join(DIR, 'native-deps-audit.csv'), 'utf8'));

// ---- summary data ----------------------------------------------------------
const dist = {};
jsRecords.forEach(r => (dist[r.license] = (dist[r.license] || 0) + 1));
const distRows = Object.entries(dist).sort((a, b) => b[1] - a[1]);
const onDisk = jsRecords.filter(r => r.source.includes('on-disk')).length;
const bundled = jsRecords.filter(r => r.source.includes('bundled')).length;
const both = jsRecords.filter(r => r.source.length > 1).length;

const summaryRows = [
  ['Streamlabs Desktop — Shipped Software License Audit'],
  [],
  ['Metric', 'Count'],
  ['JS packages shipped (total)', jsRecords.length],
  ['  in on-disk prod closure', onDisk],
  ['  in webpack bundle', bundled],
  ['  in both', both],
  ['Native modules (separate tab)', nativeRows.length - 1],
  ['JS packages still UNKNOWN', jsRecords.filter(r => r.license === 'UNKNOWN').length],
  ['JS packages manually resolved (License notes tab)', jsRecords.filter(r => r.note).length],
  [],
  ['License', 'Count'],
  ...distRows,
];

const licenseNotes = [
  ['name', 'version', 'license', 'basis / note', 'repository', 'source'],
  ...jsRecords
    .filter(r => r.note)
    .map(r => [r.name, r.version, r.license, r.note, r.repository, r.source.join('+')]),
];

const jsSheet = [
  ['name', 'version', 'license', 'repository', 'source', 'note'],
  ...jsRecords.map(r => [r.name, r.version, r.license, r.repository, r.source.join('+'), r.note || '']),
];

// ---- OOXML helpers ---------------------------------------------------------
const esc = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colRef(n) {
  let s = '';
  n++;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function cell(ref, value, headerStyle) {
  if (value === undefined || value === null || value === '') return `<c r="${ref}"${headerStyle ? ' s="1"' : ''}/>`;
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}"${headerStyle ? ' s="1"' : ''}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${headerStyle ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

// A row is a "header" row for styling if it's the first row OR a section header
// like ['Metric','Count'] — we bold row index in headerRowSet.
function sheetXml(rows, headerRowSet) {
  const body = rows
    .map((r, ri) => {
      const isHeader = headerRowSet.has(ri);
      const cells = r.map((v, ci) => cell(`${colRef(ci)}${ri + 1}`, v, isHeader)).join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`;

const sheets = [
  { name: 'Summary', xml: sheetXml(summaryRows, new Set([2, 11])) },
  { name: 'JS packages', xml: sheetXml(jsSheet, new Set([0])) },
  { name: 'Native modules', xml: sheetXml(nativeRows, new Set([0])) },
  { name: 'Native deep deps', xml: sheetXml(nativeDepsRows, new Set([0])) },
  { name: 'License notes', xml: sheetXml(licenseNotes, new Set([0])) },
];

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;

const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// ---- minimal, correct ZIP writer (built-in zlib; no data descriptors) ------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const DOS_TIME = 0, DOS_DATE = 0x0021; // 1980-01-01, deterministic
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(data, 'utf8');
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    nameBuf.copy(local, 30);
    locals.push(local, comp);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + comp.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // cd start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment len
  return Buffer.concat([...locals, centralBuf, eocd]);
}

const entries = [
  { name: '[Content_Types].xml', data: contentTypes },
  { name: '_rels/.rels', data: rootRels },
  { name: 'xl/workbook.xml', data: workbook },
  { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
  { name: 'xl/styles.xml', data: styles },
  ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
];

const buf = zip(entries);
fs.writeFileSync(path.join(DIR, 'license-audit.xlsx'), buf);
console.log(`Wrote scripts/license-audit.xlsx (${buf.length} bytes)`);
console.log(`Tabs: ${sheets.map(s => s.name).join(' | ')}`);
console.log(`JS packages: ${jsRecords.length} | Native rows: ${nativeRows.length - 1} | Native deep deps: ${nativeDepsRows.length - 1} | License notes: ${licenseNotes.length - 1}`);
