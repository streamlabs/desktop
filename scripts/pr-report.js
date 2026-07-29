#!/usr/bin/env node

const { execSync, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// DEFAULT LAST TWO WEEKS: node scripts/pr-report.js
// ALL PRS: node scripts/pr-report.js --all
// SPECIFIC RANGE: node scripts/pr-report.js --range 2024-01-01 2024-01-31
//
// OUTPUT FORMATS:
//   --format blocks   Slack Block Kit payloads (default), ready to POST to Slack
//   --format text     plain text, for reading in a terminal or a CI job summary
//   --format json     the normalized PR objects, for piping somewhere else
//
// REPORTS: --report status   (default) grouped PR status, CI/review/merge state
//          --report bots     open Renovate + Dependabot PRs, just titles and age
//                            ("renovate" and "dependabot" are accepted as aliases)
//          --report staging  open PRs targeting staging, active categories only
//                            ("preview" is an alias) — posted daily
//          --report blocked  the blocked + on-hold slice of staging — weekly
//
// Each report is meant to be posted to Slack as its own message.
//
// Also: --include-deps to keep dependency bumps, which are dropped by default.
//
// --tests  drills into Azure Pipelines and lists the individual failing tests
//          under each PR. Off by default because it costs a build timeline plus
//          a few hundred KB of log per failing job. --tests-limit N caps how many
//          PRs get drilled into (default 10, most-recent first).

const FIELDS = [
  'number',
  'title',
  'url',
  'state',
  'baseRefName',
  'author',
  'createdAt',
  'isDraft',
  'labels',
  'reviewDecision',
  'mergeable',
  'mergeStateStatus',
  'statusCheckRollup',
  'headRefName',
  'headRepositoryOwner',
].join(',');

// Enough for a plain listing: no CI state, so no statusCheckRollup.
const LIGHT_FIELDS = [
  'number',
  'title',
  'url',
  'state',
  'baseRefName',
  'author',
  'createdAt',
  'isDraft',
  'labels',
  'body',
].join(',');

// Renovate flags vulnerability-driven updates in the title. Dependabot doesn't —
// this repo has no `security` label either — so its flag comes from the body.
const RENOVATE_SECURITY_TITLE = '[SECURITY]';
const DEPENDABOT_SECURITY_BODY = /security/i;

// PRs parked deliberately. Split into their own section, but still counted.
const ON_HOLD_LABEL = /^on hold$/i;
const BLOCKED_LABEL = /^blocked$/i;

function hasLabel(pr, pattern) {
  return pr.labels.some(label => pattern.test(label));
}

// Per-branch posts. Each base branch gets an active post and a held one.
const BRANCH_REPORTS = {
  staging: { branch: 'staging', title: 'Staging' },
  master: { branch: 'master', title: 'Master' },
};

// "on hold" and "blocked" are section headings, so repeating them as labels adds
// nothing. A label matching the post's own base branch is dropped too — but only
// its own: "staging" on a master-targeted PR is real information.
const HIDDEN_LABELS = /^(on hold|blocked)$/i;
const OSN_LABEL = /needs new osn version/i;

// Categories overlap constantly — a PR is routinely approved AND blocked AND
// failing tests — so each PR is filed under exactly one, the first it matches in
// BRANCH_ASSIGN_ORDER. "On hold" and "blocked" are checked first and win over
// everything else. Nothing is lost by single-filing: the status chips on every
// row still show the full picture.
const BRANCH_CATEGORIES = {
  // Checked before review state, so a draft is never filed as awaiting review —
  // it isn't, until its author marks it ready.
  draft: { heading: 'Draft', match: pr => pr.isDraft },
  review: { heading: 'Review Required', match: pr => pr.review === 'REVIEW_REQUIRED' },
  approved: { heading: 'Approved', match: pr => pr.review === 'APPROVED' },
  conflicts: {
    heading: 'Conflicts',
    match: pr => pr.mergeState === 'DIRTY' || pr.mergeable === 'CONFLICTING',
  },
  tests: { heading: 'Tests Failing', match: pr => pr.ci.state === 'fail' },
  // While CI is broken, GitHub reports nearly every PR as mergeStateStatus
  // BLOCKED (required checks failing), which swamps this category. Filter on the
  // `blocked` label instead until the tests are fixed, then restore the line
  // below — and the matching chip in branchChips().
  blocked: { heading: 'Blocked', match: pr => hasLabel(pr, BLOCKED_LABEL) },
  // blocked: { heading: 'Blocked', match: pr => pr.mergeState === 'BLOCKED' },
  onHold: { heading: 'On Hold', match: pr => isOnHold(pr) },
  // Nothing should reach this, but a silent disappearance would be worse.
  other: { heading: 'Other', match: () => true },
};

const BRANCH_ASSIGN_ORDER = [
  'onHold',
  'blocked',
  'draft',
  'review',
  'approved',
  'conflicts',
  'tests',
  'other',
];

// The staging categories are split across two posts on different cadences: the
// active backlog is worth looking at daily, while blocked and parked PRs move
// slowly enough to be a weekly digest. Assignment order is unchanged, so a
// blocked PR appears in the weekly post and not the daily one.
const BRANCH_ACTIVE_ORDER = ['review', 'approved', 'draft', 'conflicts', 'tests', 'other'];
const BRANCH_HELD_ORDER = ['blocked', 'onHold'];

// Reports that read the whole open backlog rather than a recent window.
const BACKLOG_REPORTS = ['bots', ...Object.keys(BRANCH_REPORTS).flatMap(k => [k, `${k}-blocked`])];

// Slack's hard limits. A message may carry 50 blocks, and a single text field 3000
// characters. We stay well under both so a long backlog splits cleanly instead of
// getting rejected.
const MAX_BLOCKS_PER_MESSAGE = 45;
const MAX_CHARS_PER_SECTION = 2800;

const STALE_AFTER_DAYS = 14;
const MAX_LABELS_SHOWN = 4;
const MAX_SUITES_SHOWN = 5;

// --tests budget. Each failing job costs one log download (~250KB), so this is
// deliberately conservative.
const MAX_PRS_ENRICHED = 10;
const MAX_JOB_LOGS_PER_PR = 5;
const MAX_TESTS_SHOWN = 8;
const AZURE_CONCURRENCY = 4;

// One `gh api compare` call per PR in the staging reports.
const BEHIND_CONCURRENCY = 6;

// This pipeline publishes no structured test results to Azure Test Plans
// (ResultSummaryByBuild reports totalTests: 0), and the _apis/test/runs endpoint
// requires a sign-in. The only source of individual test names is the raw task
// log, where ava prints failures as "× file » test name <error>".
const AVA_FAIL_PREFIX = '× ';
const AVA_PROGRESS_LINE = /^\d+ tests? remaining in /;
const AVA_HOOK_WRAPPER = /(»\s*)(?:[\w.]+ hook for )/;

// ava appends its own error description after the test title, with no delimiter.
// These are the phrases ava itself generates, so they can be stripped safely.
//
// A *custom* assertion message (t.true(x, 'Expected a .mkv recording file')) can't
// be enumerated, and is left attached. Collapsing by prefix instead would be
// wrong: "Replay Buffer" and "Replay Buffer filenames contain a timestamp" are two
// real tests in the same file, so a prefix rule would silently drop one. A noisy
// line is better than a hidden failure.
const AVA_ERROR_SUFFIXES = [
  /\s*Test failed via `t\.fail\(\)`\s*$/,
  /\s*Rejected promise returned by test\s*$/,
  /\s*The log-file has errors\s*$/,
  /\s*Test finished without running any assertions\s*$/,
  /\s*Timed out\s*$/,
  /\s*Test timeout exceeded\s*$/,
  /\s*Timeout exceeded while running the test\s*$/,
];

const DEP_TITLE_PREFIXES = ['chore(deps):', 'Update dependency'];

// Renovate and Dependabot author as the "app/renovate" / "app/dependabot" bot
// accounts. Matching on the author is far more reliable than the title: most of
// their PRs are titled "Update dependency X" or "chore(deps): bump X", but not
// all, and a human can write those titles too.
const DEP_BOT_LOGIN = /renovate|dependabot/i;

// Base branch -> the name the team uses for that train. Anything else falls into
// "Other" rather than being dropped.
const GROUPS = [
  { key: 'master', heading: 'Bundle', match: pr => pr.base === 'master' },
  { key: 'staging', heading: 'Preview', match: pr => pr.base === 'staging' },
  { key: 'other', heading: 'Other branches', match: () => true },
];

const DEPS_GROUP = { key: 'deps', heading: 'Dependencies' };

/**
 * Build the `gh pr list` command for the requested window.
 */
function buildCommand(options = {}) {
  // statusCheckRollup is by far the most expensive field to ask for, so reports
  // that don't show CI state skip it.
  const fields = options.report === 'bots' ? LIGHT_FIELDS : FIELDS;

  if (options.all) {
    return `gh pr list --limit 200 --json ${fields}`;
  }

  let { startDate, endDate } = options;

  if (!startDate || !endDate) {
    const numDays = 14;
    startDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    endDate = new Date().toISOString().split('T')[0];
  }

  return `gh pr list --limit 200 --search "created:${startDate}..${endDate}" --state all --json ${fields}`;
}

function fetchPRs(options = {}) {
  const output = execSync(buildCommand(options), {
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'inherit'],
    // Default is 1MB. 200 PRs with statusCheckRollup, or with bot PR bodies
    // attached, comfortably exceeds that and would fail with ENOBUFS.
    maxBuffer: 64 * 1024 * 1024,
  });

  return JSON.parse(output);
}

/**
 * Collapse `statusCheckRollup` into a single verdict.
 *
 * The array mixes two GraphQL types: CheckRun (Actions, Azure) carries `status` +
 * `conclusion`, StatusContext (older commit statuses) carries `state`. A failure
 * outranks anything still running — this repo regularly has a PR with both a
 * FAILURE and an IN_PROGRESS entry while Azure reruns, and the failure is the part
 * worth acting on.
 */
function summarizeChecks(rollup) {
  const empty = { state: 'none', failing: 0, running: 0, total: 0, suites: [], build: null };
  if (!rollup || !rollup.length) return empty;

  let failing = 0;
  let running = 0;
  const failed = [];

  rollup.forEach(check => {
    if (check.status !== undefined && check.status !== '') {
      // CheckRun
      if (check.status !== 'COMPLETED') {
        running += 1;
      } else if (check.conclusion === 'SUCCESS') {
        // pass
      } else if (check.conclusion === 'NEUTRAL' || check.conclusion === 'SKIPPED') {
        // skipped, not a failure
      } else {
        failing += 1;
        failed.push(check);
      }
    } else {
      // StatusContext
      if (check.state === 'SUCCESS') {
        // pass
      } else if (check.state === 'PENDING' || check.state === 'EXPECTED') {
        running += 1;
      } else {
        failing += 1;
        failed.push(check);
      }
    }
  });

  let state = 'pass';
  if (failing) state = 'fail';
  else if (running) state = 'running';

  return {
    state,
    failing,
    running,
    total: rollup.length,
    suites: failingSuiteNames(failed),
    build: azureBuild(failed),
  };
}

/**
 * Turn failing check names into something short enough to sit in a Slack line.
 *
 * Azure reports one check per pipeline job, named "streamlabs.desktop (Test 1)",
 * plus a bare "streamlabs.desktop" for the pipeline as a whole. The bare one adds
 * nothing when the per-job entries are present, so it's dropped in that case.
 */
function failingSuiteNames(failed) {
  const names = failed.map(check => {
    const name = check.name || check.context || 'check';
    const job = name.match(/^streamlabs\.desktop \((.+)\)$/);
    if (job) return job[1];
    return name === 'streamlabs.desktop' ? 'pipeline' : name;
  });

  const unique = [...new Set(names)];
  return unique.length > 1 ? unique.filter(name => name !== 'pipeline') : unique;
}

/**
 * Locate the Azure build behind a PR's failing checks. Every failing Azure check
 * on a PR points at the same build, so the first match is enough. Org and project
 * come from the URL rather than being hardcoded.
 */
function azureBuild(failed) {
  for (const check of failed) {
    const match = (check.detailsUrl || '').match(
      /dev\.azure\.com\/([^/]+)\/([^/]+)\/_build\/results\?.*\bbuildId=(\d+)/,
    );
    if (match) return { org: match[1], project: match[2], buildId: match[3] };
  }
  return null;
}

/**
 * Pull individual failing test titles out of a raw Azure task log.
 */
function parseFailedTests(log) {
  const tests = new Set();

  log.split(/\r?\n/).forEach(rawLine => {
    // Azure prefixes every log line with an ISO timestamp.
    const line = rawLine.replace(/^[0-9-]+T[0-9:.]+Z\s*/, '').trim();
    if (!line.startsWith(AVA_FAIL_PREFIX)) return;

    let test = line.slice(AVA_FAIL_PREFIX.length).trim();
    if (AVA_PROGRESS_LINE.test(test)) return;

    // A failing test usually also reports its beforeEach/afterEach hook. Collapse
    // those onto the test they belong to.
    test = test.replace(AVA_HOOK_WRAPPER, '$1');
    AVA_ERROR_SUFFIXES.forEach(suffix => {
      test = test.replace(suffix, '');
    });

    test = test.trim();
    if (test) tests.add(test);
  });

  return [...tests].sort();
}

async function azureJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  // Anonymous access is an org setting. When it's off, Azure answers with a 200
  // and an HTML sign-in redirect rather than an error status.
  const body = await res.text();
  if (!body.trimStart().startsWith('{')) throw new Error('not JSON (sign-in required?)');
  return JSON.parse(body);
}

/**
 * Fetch the failing tests for one Azure build, grouped by pipeline job.
 *
 * Returns `[]` rather than throwing when Azure is unreachable or locked down —
 * a missing drill-down shouldn't take the whole report with it.
 */
async function fetchFailingTests(build) {
  const base = `https://dev.azure.com/${build.org}/${build.project}/_apis/build/builds/${build.buildId}`;

  const timeline = await azureJson(`${base}/timeline?api-version=7.1`).catch(error => ({
    failure: error instanceof Error ? error.message : String(error),
  }));
  if (timeline.failure) return { jobs: [], error: timeline.failure };

  const records = timeline.records || [];
  const jobName = parentId => {
    const parent = records.find(record => record.id === parentId);
    return parent && parent.type === 'Job' ? parent.name : null;
  };

  const tasks = records
    .filter(record => record.type === 'Task' && record.result === 'failed' && record.log)
    .map(record => ({ name: jobName(record.parentId) || record.name, logId: record.log.id }))
    .slice(0, MAX_JOB_LOGS_PER_PR);

  const jobs = [];
  for (const task of tasks) {
    try {
      const res = await fetch(`${base}/logs/${task.logId}`);
      if (!res.ok) continue;
      const tests = parseFailedTests(await res.text());
      if (tests.length) jobs.push({ job: task.name, tests });
    } catch {
      // One unreadable log shouldn't drop the others.
    }
  }

  return { jobs, error: null };
}

/** Run `worker` over `items` with a fixed number of workers in flight. */
async function mapLimit(items, limit, worker) {
  const results = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Attach failing test names to the PRs that have an Azure build to look at.
 */
async function enrichWithTests(prs, options) {
  const limit = options.testsLimit || MAX_PRS_ENRICHED;
  const eligible = prs.filter(pr => pr.ci.state === 'fail' && pr.ci.build);
  const targets = eligible.slice(0, limit);
  if (!targets.length) return { enriched: 0, skipped: 0, unreachable: 0 };

  let unreachable = 0;
  await mapLimit(targets, AZURE_CONCURRENCY, async pr => {
    const { jobs, error } = await fetchFailingTests(pr.ci.build);
    if (error) unreachable += 1;
    pr.failingTests = jobs;
  });

  return { enriched: targets.length, skipped: eligible.length - targets.length, unreachable };
}

function daysSince(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function isDependencyPR(title) {
  return DEP_TITLE_PREFIXES.some(prefix => title.startsWith(prefix));
}

/**
 * Flatten a raw `gh` PR into just what the report needs.
 */
function normalizePR(pr) {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state || 'OPEN',
    base: pr.baseRefName,
    author: (pr.author && pr.author.login) || 'unknown',
    isBot: Boolean(pr.author && pr.author.is_bot),
    ageDays: daysSince(pr.createdAt),
    isDraft: pr.isDraft,
    labels: (pr.labels || []).map(label => label.name),
    body: pr.body || '',
    review: pr.reviewDecision || '',
    mergeState: pr.mergeStateStatus || '',
    mergeable: pr.mergeable || '',
    headRef: pr.headRefName || '',
    headOwner: (pr.headRepositoryOwner && pr.headRepositoryOwner.login) || '',
    // Filled in by enrichBehindCounts() for PRs GitHub reports as BEHIND.
    behindBy: null,
    ci: summarizeChecks(pr.statusCheckRollup),
    isDependency: isDependencyPR(pr.title),
    // Populated by enrichWithTests when --tests is passed.
    failingTests: [],
  };
}

function groupPRs(prs, options = {}) {
  const groups = new Map();
  const ordered = options.includeDeps ? [...GROUPS, DEPS_GROUP] : GROUPS;
  ordered.forEach(group => groups.set(group.key, { ...group, prs: [] }));

  prs.forEach(pr => {
    if (pr.isDependency) {
      if (options.includeDeps) groups.get(DEPS_GROUP.key).prs.push(pr);
      return;
    }

    const group = GROUPS.find(candidate => candidate.match(pr));
    groups.get(group.key).prs.push(pr);
  });

  // Drop empty groups so the report doesn't carry dead headings.
  return [...groups.values()].filter(group => group.prs.length);
}

/** " : Test 1, Test 2, +2" — the suites behind a failing check count. */
function describeSuites(ci) {
  if (!ci.suites.length) return '';

  const shown = ci.suites.slice(0, MAX_SUITES_SHOWN).join(', ');
  const overflow = ci.suites.length - MAX_SUITES_SHOWN;

  return `: ${shown}${overflow > 0 ? `, +${overflow}` : ''}`;
}

/**
 * The individual failing tests, one line per job, for --tests runs.
 */
function testLines(pr, indent) {
  return pr.failingTests.map(({ job, tests }) => {
    const shown = tests.slice(0, MAX_TESTS_SHOWN);
    const overflow = tests.length - shown.length;
    const list = shown.map(test => `${indent}• ${test}`);
    if (overflow > 0) list.push(`${indent}• …and ${overflow} more`);
    return [`${indent}${job} — ${tests.length} failing`, ...list].join('\n');
  });
}

/**
 * The short status chips shown under each PR title.
 */
function statusChips(pr) {
  const chips = [];
  const isOpen = pr.state === 'OPEN';

  if (pr.state === 'MERGED') chips.push('🟣 merged');
  else if (pr.state === 'CLOSED') chips.push('⛔ closed');

  if (pr.isDraft) chips.push('draft');

  if (pr.ci.state === 'fail') chips.push(`✖ ${pr.ci.failing} failing${describeSuites(pr.ci)}`);
  else if (pr.ci.state === 'running') chips.push(`● ${pr.ci.running} running`);
  else if (pr.ci.state === 'pass') chips.push('✔ checks');
  else chips.push('– no checks');

  // Review and merge state are only meaningful while the PR is still open —
  // GitHub leaves them frozen at whatever they were when it merged.
  if (isOpen) {
    if (pr.review === 'APPROVED') chips.push('✅ approved');
    else if (pr.review === 'CHANGES_REQUESTED') chips.push('🔁 changes requested');
    else if (pr.review === 'REVIEW_REQUIRED') chips.push('👀 review required');

    // CLEAN / HAS_HOOKS is the happy path and doesn't need saying.
    if (pr.mergeState === 'DIRTY' || pr.mergeable === 'CONFLICTING') chips.push('⚠️ conflicts');
    else if (pr.mergeState === 'BLOCKED') chips.push('blocked');
    else if (pr.mergeState === 'BEHIND') chips.push('behind');
  }

  // No leading "@": Slack resolves a bare @handle into a real user mention and
  // notifies that person every time the report posts.
  chips.push(pr.author);

  const age = pr.ageDays === 0 ? 'today' : `${pr.ageDays}d`;
  chips.push(pr.ageDays > STALE_AFTER_DAYS ? `🕒 ${age}` : age);

  if (pr.labels.length) {
    const shown = pr.labels.slice(0, MAX_LABELS_SHOWN).join(', ');
    const overflow = pr.labels.length - MAX_LABELS_SHOWN;
    chips.push(overflow > 0 ? `${shown} +${overflow}` : shown);
  }

  return chips;
}

function slackLine(pr) {
  const parts = [`<${pr.url}|#${pr.number}> ${pr.title}`, `_${statusChips(pr).join(' · ')}_`];
  return parts.concat(testLines(pr, '        ')).join('\n');
}

function textLine(pr) {
  const parts = [
    `  #${pr.number} ${pr.title}`,
    `    ${statusChips(pr).join(' · ')}`,
    `    ${pr.url}`,
  ];
  return parts.concat(testLines(pr, '      ')).join('\n');
}

function section(text) {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

/**
 * Slack mrkdwn has bold, italic and strike but no underline — that only exists
 * on rich_text elements, so an underlined heading has to be a rich_text block.
 */
function underlinedHeading(text) {
  return {
    type: 'rich_text',
    elements: [
      {
        type: 'rich_text_section',
        elements: [{ type: 'text', text, style: { underline: true } }],
      },
    ],
  };
}

/**
 * Pack PR lines into as few section blocks as the character budget allows.
 */
function packLines(lines) {
  const blocks = [];
  let buffer = [];
  let length = 0;

  lines.forEach(line => {
    // +2 for the blank line joining entries.
    if (buffer.length && length + line.length + 2 > MAX_CHARS_PER_SECTION) {
      blocks.push(section(buffer.join('\n\n')));
      buffer = [];
      length = 0;
    }
    buffer.push(line);
    length += line.length + 2;
  });

  if (buffer.length) blocks.push(section(buffer.join('\n\n')));

  return blocks;
}

/**
 * Render Slack Block Kit payloads. Returns an array — a backlog large enough to
 * exceed the per-message block limit is split across several messages.
 */
function summaryLine(groups, meta) {
  const total = groups.reduce((sum, group) => sum + group.prs.length, 0);
  const parts = [`${total} PR${total === 1 ? '' : 's'}`, meta.window];

  // Say so rather than letting filtered PRs disappear without a trace.
  if (meta.hiddenDeps) {
    parts.push(`${meta.hiddenDeps} dependency PR${meta.hiddenDeps === 1 ? '' : 's'} hidden`);
  }

  // Same reasoning for the --tests caps: never imply fuller coverage than we have.
  if (meta.tests) {
    if (meta.tests.skipped) parts.push(`test detail capped at ${meta.tests.enriched} PRs`);
    if (meta.tests.unreachable) parts.push(`${meta.tests.unreachable} Azure build unreadable`);
  }

  parts.push(`generated ${meta.generatedAt}`);

  return parts.join(' · ');
}

function renderBlocks(groups, meta) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${meta.title} — ${meta.repo}`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: summaryLine(groups, meta) }],
    },
  ];

  groups.forEach((group, index) => {
    if (index > 0) blocks.push({ type: 'divider' });
    blocks.push(section(`*${group.heading}* (${group.prs.length})`));
    blocks.push(...packLines(group.prs.map(slackLine)));
  });

  // Split into messages small enough for Slack to accept.
  const messages = [];
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_MESSAGE) {
    messages.push({ blocks: blocks.slice(i, i + MAX_BLOCKS_PER_MESSAGE) });
  }

  return messages;
}

function renderText(groups, meta) {
  const lines = [`${meta.title} — ${meta.repo}`, summaryLine(groups, meta)];

  groups.forEach(group => {
    lines.push('', `${group.heading} (${group.prs.length})`);
    group.prs.forEach(pr => lines.push(textLine(pr)));
  });

  if (!groups.length) lines.push('', 'No PRs matched.');

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* Dependency bot report                                                      */
/* -------------------------------------------------------------------------- */

function isDependencyBotPR(pr) {
  return pr.isBot && DEP_BOT_LOGIN.test(pr.author);
}

/** "app/renovate" -> "renovate" */
function botName(pr) {
  return pr.author.replace(/^app\//, '');
}

function isOnHold(pr) {
  return pr.labels.some(label => ON_HOLD_LABEL.test(label));
}

/** "  [SECURITY]", unless the title already carries it. */
function securityFlag(pr) {
  if (!isSecurityPR(pr) || pr.title.includes(RENOVATE_SECURITY_TITLE)) return '';
  return `  ${RENOVATE_SECURITY_TITLE}`;
}

function isSecurityPR(pr) {
  return botName(pr) === 'dependabot'
    ? DEPENDABOT_SECURITY_BODY.test(pr.body)
    : pr.title.includes(RENOVATE_SECURITY_TITLE);
}

/**
 * Oldest first — the point of this report is spotting what has gone stale.
 * Deliberately parked PRs are split out rather than listed, so a permanently
 * on-hold PR doesn't sit at the top skewing the age.
 */
/**
 * Split a set into the active backlog and the deliberately parked PRs, oldest
 * first. Shared by the bot and staging reports.
 */
function splitOnHold(all) {
  const byAge = (a, b) => b.ageDays - a.ageDays;

  return {
    all,
    listed: all.filter(pr => !isOnHold(pr)).sort(byAge),
    onHold: all.filter(isOnHold).sort(byAge),
  };
}

function dependencyBotPRs(prs) {
  return splitOnHold(prs.filter(isDependencyBotPR));
}

function dependencyBotSummary({ all, listed, onHold }, meta) {
  // Totals cover every bot PR, on hold included, so the per-bot counts add up to
  // the headline number.
  const parts = [`${all.length} open PR${all.length === 1 ? '' : 's'}`];

  // A separate total per bot, always both, so "no Dependabot PRs" is visible
  // rather than merely absent.
  ['renovate', 'dependabot'].forEach(name => {
    parts.push(`${all.filter(pr => botName(pr) === name).length} ${name}`);
  });

  const security = all.filter(isSecurityPR).length;
  if (security) parts.push(`${security} security`);
  if (onHold.length) parts.push(`${onHold.length} on hold`);

  // Age is measured over the active backlog only — a permanently parked PR would
  // otherwise dominate it, which is why it's held out of the main list.
  if (listed.length) {
    parts.push(`oldest${onHold.length ? ' active' : ''} ${listed[0].ageDays}d`);
  }

  parts.push(`generated ${meta.generatedAt}`);

  return parts.join(' · ');
}

function renderDependencyBotText(result, meta) {
  const { all, listed, onHold } = result;
  // Bold marker for the plain-text preview only; the Slack header block is
  // already bold and would print the asterisks literally.
  const lines = [`*${meta.title} — ${meta.repo}*`, dependencyBotSummary(result, meta), ''];

  if (!all.length) {
    lines.push('No open dependency bot PRs.');
    return lines.join('\n');
  }

  // Pad to the widest entry across both sections so the columns line up.
  const ageWidth = Math.max(...all.map(pr => `${pr.ageDays}d`.length));
  const numWidth = Math.max(...all.map(pr => `#${pr.number}`.length));
  const botWidth = Math.max(...all.map(pr => botName(pr).length));

  const write = pr => {
    const age = `${pr.ageDays}d`.padStart(ageWidth);
    const num = `#${pr.number}`.padEnd(numWidth);
    // securityFlag() stays quiet when the title already says [SECURITY].
    lines.push(`  ${age}  ${num}  ${botName(pr).padEnd(botWidth)}  ${pr.title}${securityFlag(pr)}`);
  };

  if (listed.length) listed.forEach(write);
  else lines.push('  No active dependency bot PRs.');

  if (onHold.length) {
    lines.push('', `On Hold (${onHold.length})`);
    onHold.forEach(write);
  }

  return lines.join('\n');
}

function renderDependencyBotBlocks(result, meta) {
  const { all, listed, onHold } = result;
  const line = pr =>
    `\`${pr.ageDays}d\`  <${pr.url}|#${pr.number}>  _${botName(pr)}_  ${pr.title}${securityFlag(
      pr,
    )}`;

  const blocks = [
    // paginate() replaces this with a per-message header; plain_text can't carry
    // mrkdwn, so no asterisks here.
    { type: 'header', text: { type: 'plain_text', text: meta.title, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: dependencyBotSummary(result, meta) }] },
  ];

  if (!all.length) {
    blocks.push(section('No open dependency bot PRs.'));
  } else {
    if (listed.length) blocks.push(...packLines(listed.map(line)));
    else blocks.push(section('No active dependency bot PRs.'));

    if (onHold.length) {
      blocks.push({ type: 'divider' });
      blocks.push(underlinedHeading(`On Hold (${onHold.length})`));
      blocks.push(...packLines(onHold.map(line)));
    }
  }

  return paginate(blocks, meta);
}

/* -------------------------------------------------------------------------- */
/* Staging report                                                             */
/* -------------------------------------------------------------------------- */

function reviewChip(pr) {
  if (pr.review === 'APPROVED') return '✅ approved';
  if (pr.review === 'CHANGES_REQUESTED') return '🔁 changes requested';
  return '👀 review required';
}

function ciChip(pr) {
  if (pr.ci.state === 'fail') return `⛔ ${pr.ci.failing} failing${describeSuites(pr.ci)}`;
  if (pr.ci.state === 'running') return `● ${pr.ci.running} running`;
  if (pr.ci.state === 'pass') return '☑️ checks pass';
  return '– no checks';
}

function labelChips(pr, branch) {
  return pr.labels
    .filter(label => !HIDDEN_LABELS.test(label) && label.toLowerCase() !== branch)
    .map(label => `${OSN_LABEL.test(label) ? '🔵' : 'ℹ️'} ${label}`);
}

/**
 * How many commits behind its base branch each PR is.
 *
 * Deliberately *not* gated on `mergeStateStatus === 'BEHIND'`. GitHub only
 * reports BEHIND for a branch that is otherwise clean, so a PR with conflicts is
 * reported DIRTY no matter how far back it sits — no staging PR here is BEHIND,
 * yet several are over a thousand commits behind. The count has to be computed
 * for every PR to be worth anything.
 *
 * One compare call per PR, run a few at a time.
 */
async function enrichBehindCounts(prs, repo) {
  const owner = repo.split('/')[0];
  const targets = prs.filter(pr => pr.headRef);

  await mapLimit(targets, BEHIND_CONCURRENCY, async pr => {
    // Fork branches need an owner prefix; same-repo branches must not have one.
    const head =
      pr.headOwner && pr.headOwner !== owner ? `${pr.headOwner}:${pr.headRef}` : pr.headRef;

    const behind = await execFileAsync(
      'gh',
      ['api', `repos/${repo}/compare/${pr.base}...${head}`, '--jq', '.behind_by'],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    )
      .then(({ stdout }) => Number.parseInt(String(stdout).trim(), 10))
      // A deleted or inaccessible branch just leaves the count off the row.
      .catch(() => NaN);

    if (Number.isInteger(behind)) pr.behindBy = behind;
  });
}

/** Second line: review state, then anything blocking, then labels. */
function branchChips(pr, branch) {
  const chips = [];

  if (pr.isDraft) chips.push('draft');
  chips.push(reviewChip(pr));

  // Omitted entirely when the branch merges cleanly.
  if (pr.mergeState === 'DIRTY' || pr.mergeable === 'CONFLICTING') chips.push('⚠️ conflicts');
  // if (pr.mergeState === 'BLOCKED') chips.push('blocked');
  const n = pr.behindBy;
  if (Number.isInteger(n) && n > 0) chips.push(`⬇️ behind ${n} commit${n === 1 ? '' : 's'}`);
  else if (pr.mergeState === 'BEHIND') chips.push('⬇️ behind');

  return chips.concat(labelChips(pr, branch));
}

/**
 * Categorise the open PRs targeting one base branch, then keep only the sections
 * this post covers. `displayOrder` selects which — see BRANCH_ACTIVE_ORDER /
 * BRANCH_HELD_ORDER.
 *
 * Dependency-bot PRs are excluded: they have their own post, and on master they
 * are a third of the backlog, which would mean 13 duplicated rows every day.
 */
function branchPRs(prs, branch, displayOrder) {
  // Base branch, not a same-named label — plenty of PRs are unlabelled, and the
  // label alone would miss them.
  const open = prs
    .filter(pr => pr.base === branch && pr.state === 'OPEN' && !isDependencyBotPR(pr))
    .sort((a, b) => a.ageDays - b.ageDays); // newest first

  const groups = new Map(
    Object.entries(BRANCH_CATEGORIES).map(([key, c]) => [key, { ...c, prs: [] }]),
  );
  open.forEach(pr => {
    const key = BRANCH_ASSIGN_ORDER.find(k => BRANCH_CATEGORIES[k].match(pr));
    groups.get(key).prs.push(pr);
  });

  const categories = displayOrder.map(key => groups.get(key)).filter(g => g.prs.length);

  // Counts describe this post's own PRs, not the whole staging backlog.
  const all = categories.flatMap(group => group.prs);

  return { all, categories, totalOpen: open.length };
}

function branchSummary({ all, categories, totalOpen }, meta) {
  const parts = [`${all.length} PR${all.length === 1 ? '' : 's'}`];

  // One count per category, in the order they're listed below.
  categories.forEach(group => parts.push(`${group.prs.length} ${group.heading.toLowerCase()}`));

  // Only worth stating separately when drafts aren't already their own section
  // (they aren't in the blocked/on-hold post, where a draft can still turn up).
  const drafts = all.filter(pr => pr.isDraft).length;
  if (drafts && !categories.some(group => group.heading === 'Draft')) {
    parts.push(`${drafts} draft${drafts === 1 ? '' : 's'}`);
  }

  // This post is a slice of the branch's backlog; say what the whole is so the
  // headline number isn't read as the total.
  if (all.length !== totalOpen) parts.push(`of ${totalOpen} open targeting ${meta.branch}`);
  if (meta.botCount) parts.push(`${meta.botCount} dependency bot PRs posted separately`);

  parts.push(`generated ${meta.generatedAt}`);

  return parts.join(' · ');
}

function renderBranchText(result, meta) {
  const { all, categories } = result;
  // Slack renders the post heading via a header block, which is bold already;
  // the marker here is so the plain-text preview reads the same way.
  const lines = [`*${meta.title} — ${meta.repo}*`, branchSummary(result, meta)];

  if (!all.length) {
    lines.push('', meta.empty);
    return lines.join('\n');
  }

  // Continuation lines hang under the title, past the age and number columns.
  const ageWidth = Math.max(...all.map(pr => `${pr.ageDays}d`.length));
  const numWidth = Math.max(...all.map(pr => `#${pr.number}`.length));
  const indent = ' '.repeat(2 + ageWidth + 2 + numWidth + 1);

  categories.forEach(group => {
    // Slack underlines this; plain text gets a rule so the two read the same.
    const heading = `${group.heading} (${group.prs.length})`;
    lines.push('', heading, '─'.repeat(heading.length));

    group.prs.forEach(pr => {
      const age = `${pr.ageDays}d`.padStart(ageWidth);
      const num = `#${pr.number}`.padEnd(numWidth);
      // No leading "@" — Slack turns a bare @handle into a real user mention
      // (and notifies them) whenever it matches a workspace member.
      lines.push(`  ${age}  ${num}  ${pr.title}  _${pr.author}_`);
      lines.push(`${indent}${branchChips(pr, meta.branch).join(' · ')}`);
      lines.push(`${indent}${ciChip(pr)}`);
    });
  });

  return lines.join('\n');
}

function renderBranchBlocks(result, meta) {
  const { all, categories } = result;
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${meta.title} — ${meta.repo}`, emoji: true },
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: branchSummary(result, meta) }] },
  ];

  if (!all.length) {
    blocks.push(section(meta.empty));
  } else {
    const line = pr =>
      [
        // See renderBranchText: a bare "@handle" becomes a Slack mention.
        `\`${pr.ageDays}d\`  <${pr.url}|#${pr.number}>  ${pr.title}  _${pr.author}_`,
        branchChips(pr, meta.branch).join(' · '),
        ciChip(pr),
      ].join('\n');

    categories.forEach((group, index) => {
      if (index > 0) blocks.push({ type: 'divider' });
      blocks.push(underlinedHeading(`${group.heading} (${group.prs.length})`));
      blocks.push(...packLines(group.prs.map(line)));
    });
  }

  return paginate(blocks, meta);
}

/**
 * Chunk a post's blocks into Slack-sized messages, each carrying its own header.
 *
 * The header and summary are rebuilt per message rather than sliced along with
 * everything else — otherwise message 2 onwards would arrive untitled. When a
 * post spans several messages the header is numbered "(2/3)" so they read in
 * order, since Slack gives no other clue they belong together.
 */
function paginate(blocks, meta) {
  const [header, ...body] = blocks;
  const perMessage = MAX_BLOCKS_PER_MESSAGE - 1;

  const chunks = [];
  for (let i = 0; i < body.length; i += perMessage) chunks.push(body.slice(i, i + perMessage));
  if (!chunks.length) chunks.push([]);

  return chunks.map((chunk, index) => {
    const suffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : '';
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${meta.title} — ${meta.repo}${suffix}`, emoji: true },
        },
        ...chunk,
      ],
    };
  });
}

function currentRepo() {
  try {
    const output = execSync('gh repo view --json nameWithOwner', {
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    return JSON.parse(output).nameWithOwner;
  } catch {
    return 'this repo';
  }
}

function describeWindow(options) {
  if (options.all) return 'all open PRs';
  if (options.startDate && options.endDate) {
    return `opened ${options.startDate} to ${options.endDate}, any state`;
  }
  return 'opened in the last 14 days, any state';
}

// `--all` lists open PRs only; the date-range searches use --state all, so they
// also return merged and closed ones. Don't claim otherwise in the header.
function describeTitle(options) {
  return options.all ? 'Open PRs' : 'PRs';
}

async function prReport(options = {}) {
  // The Renovate backlog is mostly months old, so a 14-day window would show a
  // fraction of it. Default that report to every open PR instead.
  // Both of these are backlog reports: the whole open set, not a recent window.
  // A 14-day window would show 8 of 14 staging PRs, half of them already closed.
  const isBacklog = BACKLOG_REPORTS.includes(options.report);
  if (isBacklog && !options.startDate) options.all = true;

  const prs = fetchPRs(options).map(normalizePR);

  if (isBacklog) {
    const meta = {
      repo: currentRepo(),
      generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    };

    if (options.report === 'bots') {
      meta.title = 'Dependency bot PRs';
      const matched = dependencyBotPRs(prs);
      if (options.format === 'json') return JSON.stringify(matched.listed, null, 2);
      if (options.format === 'text') return renderDependencyBotText(matched, meta);
      return JSON.stringify(renderDependencyBotBlocks(matched, meta), null, 2);
    }

    // "<branch>" or "<branch>-blocked".
    const held = options.report.endsWith('-blocked');
    const { branch, title } = BRANCH_REPORTS[held ? options.report.split('-')[0] : options.report];

    meta.branch = branch;
    meta.title = held ? `${title}: Blocked/On Hold` : title;
    meta.empty = held
      ? `No blocked or on-hold PRs targeting ${branch}.`
      : `No open PRs targeting ${branch}.`;

    const inScope = prs.filter(
      pr => pr.base === branch && pr.state === 'OPEN' && !isDependencyBotPR(pr),
    );
    // Only this branch's PRs need the compare calls, so narrow before enriching.
    await enrichBehindCounts(inScope, meta.repo);

    // Surfaced in the summary so the excluded bot PRs aren't a silent omission.
    meta.botCount = prs.filter(
      pr => pr.base === branch && pr.state === 'OPEN' && isDependencyBotPR(pr),
    ).length;

    const matched = branchPRs(prs, branch, held ? BRANCH_HELD_ORDER : BRANCH_ACTIVE_ORDER);

    if (options.format === 'json') return JSON.stringify(matched.all, null, 2);
    if (options.format === 'text') return renderBranchText(matched, meta);
    return JSON.stringify(renderBranchBlocks(matched, meta), null, 2);
  }

  let tests = null;
  if (options.tests) tests = await enrichWithTests(prs, options);

  const groups = groupPRs(prs, options);
  const meta = {
    repo: currentRepo(),
    title: describeTitle(options),
    window: describeWindow(options),
    hiddenDeps: options.includeDeps ? 0 : prs.filter(pr => pr.isDependency).length,
    tests,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };

  if (options.format === 'json') return JSON.stringify(prs, null, 2);
  if (options.format === 'text') return renderText(groups, meta);
  return JSON.stringify(renderBlocks(groups, meta), null, 2);
}

function parseArgs(args) {
  const options = { format: 'blocks', report: 'status' };

  if (args.includes('--report')) {
    const report = args[args.indexOf('--report') + 1];
    // "renovate" kept as an alias now that the report covers Dependabot too.
    const aliases = {
      renovate: 'bots',
      dependabot: 'bots',
      preview: 'staging',
      // Was the only held post before master gained one.
      blocked: 'staging-blocked',
      bundle: 'master',
    };
    const resolved = aliases[report] || report;
    const known = ['status', ...BACKLOG_REPORTS];
    if (!known.includes(resolved)) {
      throw new Error(`Unknown --report "${report}". Expected one of: ${known.join(', ')}.`);
    }
    options.report = resolved;
  }

  if (args.includes('--all')) {
    options.all = true;
  } else if (args.includes('--range')) {
    const startIdx = args.indexOf('--range');
    if (args[startIdx + 1] && args[startIdx + 2]) {
      options.startDate = args[startIdx + 1];
      options.endDate = args[startIdx + 2];
    }
  }

  if (args.includes('--include-deps')) options.includeDeps = true;
  if (args.includes('--tests')) options.tests = true;

  if (args.includes('--tests-limit')) {
    const limit = Number(args[args.indexOf('--tests-limit') + 1]);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('--tests-limit expects a positive integer.');
    }
    options.testsLimit = limit;
    options.tests = true;
  }

  if (args.includes('--format')) {
    const format = args[args.indexOf('--format') + 1];
    if (!['blocks', 'text', 'json'].includes(format)) {
      throw new Error(`Unknown --format "${format}". Expected blocks, text, or json.`);
    }
    options.format = format;
  }

  return options;
}

// If this script is run directly (not imported)
if (require.main === module) {
  Promise.resolve()
    .then(() => prReport(parseArgs(process.argv.slice(2))))
    .then(report => console.log(report))
    .catch(error => {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      } else {
        console.error('Unknown error:', error);
      }
      process.exit(1);
    });
}

module.exports = {
  prReport,
  parseArgs,
  normalizePR,
  summarizeChecks,
  failingSuiteNames,
  azureBuild,
  parseFailedTests,
  fetchFailingTests,
  groupPRs,
  statusChips,
  renderBlocks,
  renderText,
  branchPRs,
  renderBranchText,
  renderBranchBlocks,
  dependencyBotPRs,
  paginate,
};
