/**
 * audit-licenses.js
 *
 * Produces the precise set of third-party packages whose CODE and/or LICENSE
 * text actually ship in the packaged Streamlabs Desktop app, and emits a
 * license manifest for compliance.
 *
 * WHY this exists (and why `yarn licenses generate-disclaimer` is not enough):
 *   `generate-agreement` runs `yarn licenses generate-disclaimer`, which walks
 *   the ENTIRE dependency tree — including pure build tooling (webpack, eslint,
 *   babel, typescript, electron-builder, ava, webdriverio, ...) that never ends
 *   up in a shipped artifact. That OVER-reports.
 *
 *   Conversely, filtering to `dependencies` only would UNDER-report, because
 *   many `devDependencies` (react, vue, antd, lodash, moment, rxjs, ...) are
 *   compiled directly INTO the webpack bundle (bundles/*.js), which ships.
 *
 * The true shipped license surface is the UNION of two sets:
 *
 *   A) On-disk set: the production dependency closure electron-builder packs.
 *      electron-builder ships `node_modules` but auto-prunes devDependencies,
 *      so this is `dependencies` + `optionalDependencies` + their transitive
 *      prod deps. Captures externals (aws-sdk, realm, socket.io-client, ...)
 *      and main.js runtime deps (crash-handler, game_overlay, electron-updater)
 *      even though webpack never bundles them.
 *      (Native C++ modules are in this set but are audited separately via
 *       scripts/repositories.json — see AUDITED_SEPARATELY below.)
 *
 *   B) Bundled set: every package under node_modules that the webpack module
 *      graph references. Captures devDependencies (and their transitive deps)
 *      whose source is compiled into the shipped bundles.
 *
 * USAGE:
 *   1) Produce a webpack stats file (dev or prod config — same module graph):
 *        yarn webpack-cli --config ./webpack.prod.config.js --json > scripts/stats.json
 *      (Set B is skipped with a warning if the stats file is absent, so you can
 *       run the on-disk audit alone first.)
 *   2) node scripts/audit-licenses.js
 *
 * OUTPUT (written next to this script):
 *   scripts/license-audit.json  — machine-readable manifest
 *   scripts/license-audit.csv   — spreadsheet-friendly (name,version,license,repo,source)
 *
 * Read-only: this script never mutates node_modules or package.json.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const STATS_PATH = path.join(__dirname, 'stats.json');
const pkg = require(path.join(ROOT, 'package.json'));

// Native C++ modules are shipped but carry their own upstream repos/licenses,
// tracked in scripts/repositories.json. Flag them so they are not silently
// folded into the JS report — they must be audited at their source repos.
const AUDITED_SEPARATELY = new Set(
  require('./repositories.json').root.map(r => r.name),
);

// Manually-resolved licenses for packages that declare no `license` field and
// have no detectable LICENSE file. Each was confirmed from the source noted.
// Applied ONLY when auto-detection yields UNKNOWN, so it never masks real data.
// Revisit if a package's version changes.
const LICENSE_OVERRIDES = {
  'component-bind': { license: 'MIT', note: 'README states MIT; no license field/file' },
  'component-inherit': { license: 'MIT', note: 'README states MIT; no license field/file' },
  indexof: { license: 'MIT', note: 'README states MIT; no license field/file' },
  'vue-toasted': { license: 'MIT', note: 'LICENSE file is MIT; no package.json field' },
  'gl-transitions': {
    license: 'MIT',
    note: 'Repo LICENSE is MIT; some transitions carry their own header license',
  },
  '@realm/fetch': {
    license: 'Apache-2.0',
    note: 'Undeclared in npm metadata; published from the Apache-2.0 realm-js monorepo (dep of realm)',
  },
  'streamlabs-beaker': {
    license: 'UNLICENSED (first-party)',
    note: 'First-party Streamlabs package (maintained @streamlabs.com); no OSS license declared — confirm internally',
  },
};

/** Resolve a package dir the way Node does: nearest node_modules up the chain. */
function resolvePkgDir(name, fromDir) {
  let dir = fromDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: top-level hoisted install.
  const hoisted = path.join(NODE_MODULES, name);
  return fs.existsSync(path.join(hoisted, 'package.json')) ? hoisted : null;
}

/** Set A — production dependency closure (what electron-builder ships on disk). */
function computeOnDiskSet() {
  const found = new Map(); // name -> { dir, version }
  const roots = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
  const queue = Object.keys(roots).map(name => ({ name, from: ROOT }));

  while (queue.length) {
    const { name, from } = queue.pop();
    if (found.has(name)) continue;
    const dir = resolvePkgDir(name, from);
    if (!dir) continue; // optional dep not installed on this platform, etc.
    const p = require(path.join(dir, 'package.json'));
    found.set(name, { dir, version: p.version });
    // Only production deps propagate to the shipped closure.
    const next = { ...(p.dependencies || {}), ...(p.optionalDependencies || {}) };
    for (const dep of Object.keys(next)) if (!found.has(dep)) queue.push({ name: dep, from: dir });
  }
  return found;
}

/** Set B — packages referenced by the webpack module graph (bundled code). */
function computeBundledSet() {
  if (!fs.existsSync(STATS_PATH)) {
    console.warn(
      `\n[warn] ${path.relative(ROOT, STATS_PATH)} not found — SKIPPING bundled set (B).\n` +
        `       Generate it with:\n` +
        `         yarn webpack-cli --config ./webpack.prod.config.js --json > scripts/stats.json\n` +
        `       Report will contain the on-disk set (A) only.\n`,
    );
    return new Map();
  }
  const stats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  const modules = collectModules(stats);
  const names = new Set();
  const re = /node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/g;
  for (const m of modules) {
    // Use ONLY the resource file, never the loader chain. A webpack module
    // identifier is `loader1!loader2!resource`; the loaders are build-time and
    // do NOT ship, so keying off the identifier would falsely pull in
    // babel-loader/ts-loader/etc. `nameForCondition` is the loader-free
    // resource path; fall back to the segment after the last `!`.
    const resource = m.nameForCondition || (m.identifier || m.name || '').split('!').pop();
    if (!resource) continue;
    // Take the LAST node_modules match so nested installs resolve to the deepest
    // (real owning) package; scoped names (@scope/name) handled by the pattern.
    let match;
    let owner = null;
    re.lastIndex = 0;
    while ((match = re.exec(resource))) owner = match[1];
    if (owner) names.add(owner.replace(/\\/g, '/'));
  }

  const found = new Map();
  for (const name of names) {
    const dir = resolvePkgDir(name, ROOT);
    if (!dir) continue;
    found.set(name, { dir, version: require(path.join(dir, 'package.json')).version });
  }
  return found;
}

/** Flatten webpack stats modules across all chunks/children. */
function collectModules(stats) {
  const out = [];
  const visit = node => {
    if (!node) return;
    if (Array.isArray(node.modules)) out.push(...node.modules);
    if (Array.isArray(node.children)) node.children.forEach(visit);
    if (Array.isArray(node.chunks)) node.chunks.forEach(c => Array.isArray(c.modules) && out.push(...c.modules));
  };
  visit(stats);
  return out;
}

/** Best-effort license id + license-file path for a package dir. */
function readLicense(dir, p) {
  let license =
    (typeof p.license === 'string' && p.license) ||
    (p.license && p.license.type) ||
    (Array.isArray(p.licenses) && p.licenses.map(l => l.type).join(' OR ')) ||
    'UNKNOWN';
  const file = fs
    .readdirSync(dir)
    .find(f => /^(licen[cs]e|copying)(\..*)?$/i.test(f));
  return { license, licenseFile: file ? path.join(dir, file) : null };
}

function repoUrl(p) {
  const r = p.repository;
  if (!r) return '';
  return (typeof r === 'string' ? r : r.url || '').replace(/^git\+/, '').replace(/\.git$/, '');
}

// ---- build the union -------------------------------------------------------
const onDisk = computeOnDiskSet();
const bundled = computeBundledSet();

const all = new Map(); // name -> record
for (const [name, info] of onDisk) addRecord(name, info, 'on-disk');
for (const [name, info] of bundled) addRecord(name, info, 'bundled');

function addRecord(name, info, source) {
  const existing = all.get(name);
  if (existing) {
    if (!existing.source.includes(source)) existing.source.push(source);
    return;
  }
  const p = require(path.join(info.dir, 'package.json'));
  let { license, licenseFile } = readLicense(info.dir, p);
  let note = '';
  if (license === 'UNKNOWN' && LICENSE_OVERRIDES[name]) {
    ({ license, note } = LICENSE_OVERRIDES[name]);
  }
  all.set(name, {
    name,
    version: info.version,
    license,
    repository: repoUrl(p),
    licenseFile: licenseFile ? path.relative(ROOT, licenseFile) : null,
    note,
    source: [source],
    auditedSeparately: AUDITED_SEPARATELY.has(name),
  });
}

const allRecords = [...all.values()].sort((a, b) => a.name.localeCompare(b.name));

// Native C++ modules are tracked separately (scripts/native-license-todo.*), so
// they are EXCLUDED from the JS manifest below — this report is the JS surface only.
const nativeRecords = allRecords.filter(r => r.auditedSeparately);
const records = allRecords.filter(r => !r.auditedSeparately);

// ---- emit ------------------------------------------------------------------
fs.writeFileSync(
  path.join(__dirname, 'license-audit.json'),
  JSON.stringify(records, null, 2),
);

const csv = [
  'name,version,license,repository,source,note',
  ...records.map(r =>
    [r.name, r.version, r.license, r.repository, r.source.join('+'), r.note || '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  ),
].join('\n');
fs.writeFileSync(path.join(__dirname, 'license-audit.csv'), csv);

// ---- summary ---------------------------------------------------------------
const missing = records.filter(r => r.license === 'UNKNOWN');
const noted = records.filter(r => r.note);
console.log(`On-disk (prod closure) : ${onDisk.size}`);
console.log(`Bundled (webpack graph): ${bundled.size}`);
console.log(`JS shipped (this report): ${records.length}`);
console.log(`Native (tracked separately, excluded): ${nativeRecords.length} -> ${nativeRecords.map(r => r.name).join(', ')}`);
console.log(`Manually resolved (see note column): ${noted.length}`);
noted.forEach(r => console.log(`  - ${r.name}@${r.version} -> ${r.license}`));
if (missing.length) {
  console.log(`\nStill UNKNOWN (${missing.length}) — resolve manually:`);
  missing.forEach(r => console.log(`  - ${r.name}@${r.version}`));
} else {
  console.log(`\nNo UNKNOWN licenses remain.`);
}
console.log(`\nWrote scripts/license-audit.json and scripts/license-audit.csv`);
