/**
 * Typecheck the React UI (app/components-react) with its stricter config
 * (strictNullChecks: true, jsx: react).
 *
 * Why a wrapper instead of a plain `tsc -p`?
 * Running tsc against app/components-react/tsconfig.json also pulls in the legacy
 * Vue `.tsx` files under app/components that React files happen to import. Those
 * Vue files are then checked under React + strict-null settings that don't apply
 * to them, producing ~1500 false-positive errors. The webpack build avoids this
 * via ts-loader's `reportFiles: ['app/components-react/**']`, which only *reports*
 * errors for React files. tsc has no equivalent, so we replicate it here: run the
 * full check, but only fail on errors located in app/components-react/.
 *
 * Trade-off (matches the build's existing behavior): a change in
 * app/components-react that breaks an imported legacy file is not flagged here.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const TS_PROJECT = 'app/components-react/tsconfig.json';
// Only errors under this prefix are treated as real failures.
const REPORT_PREFIX = 'app/components-react/';

const tsc = path.join('node_modules', 'typescript', 'bin', 'tsc');

const res = spawnSync(process.execPath, [tsc, '--noEmit', '-p', TS_PROJECT], {
  encoding: 'utf8',
});

if (res.error) {
  console.error('Failed to run tsc:', res.error);
  process.exit(1);
}

const lines = `${res.stdout || ''}${res.stderr || ''}`.split(/\r?\n/);
const ours = lines.filter(line => {
  // Normalize Windows backslashes so the prefix match works on every platform.
  const normalized = line.replace(/\\/g, '/');
  return /error TS\d+/.test(normalized) && normalized.startsWith(REPORT_PREFIX);
});

if (ours.length) {
  console.error(ours.join('\n'));
  console.error(`\n${ours.length} type error(s) in ${REPORT_PREFIX}`);
  process.exit(1);
}

console.log(`${REPORT_PREFIX}: no type errors`);
