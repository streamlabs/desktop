// @ts-check

const fs = require('fs');
const moment = require('moment');
const { info, error, executeCmd } = require('./prompt');
const { getTagCommitId } = require('./util');

// previous tag should be following rule:
//  v{major}.{minor}.{yyyymmdd}-[{channel}.]{ord}[internalMark]
const VERSION_REGEXP =
  /(?<major>\d+)\.(?<minor>\d+)\.(?<date>\d{8})-((?<channel>\w+)\.)?(?<ord>\d+)(?<internalMark>d)?/;

function parseVersion(tag) {
  const result = VERSION_REGEXP.exec(tag);
  if (result && result.groups) return result.groups;
  throw new Error(`cannot parse a given tag: ${tag}`);
}

/** @typedef {{ channel: 'stable' | 'unstable', environment: 'public' | 'internal' }} VersionContext */

/**
 * @param {string} tag
 * @returns {VersionContext}
 */
function getVersionContext(tag) {
  const result = parseVersion(tag);
  if (result.channel === 'stable') {
    throw new Error('stable channel must have no prefix');
  }

  const channel = result.channel || 'stable';
  const environment = result.internalMark ? 'internal' : 'public';

  if (channel !== 'stable' && channel !== 'unstable') {
    throw new Error(`invalid channel: ${channel}`);
  }

  return {
    channel,
    environment,
  };
}

/**
 * @param {VersionContext} a
 * @param {VersionContext} b
 */
function isSameVersionContext(a, b) {
  return a.channel === b.channel && a.environment === b.environment;
}

function validateVersionContext({ versionTag, releaseEnvironment, releaseChannel }) {
  const { channel, environment } = getVersionContext(versionTag);

  if (releaseChannel !== channel || releaseEnvironment !== environment) {
    throw new Error('invalid version context');
  }
}

function generateNewVersion({ previousVersion, now = Date.now() }) {
  const { major, minor, date, channel, ord, internalMark } = parseVersion(previousVersion);

  const today = moment(now).format('YYYYMMDD');
  const newOrd = date === today ? parseInt(ord, 10) + 1 : 1;
  const channelPrefix = channel ? `${channel}.` : '';
  return `${major}.${minor}.${today}-${channelPrefix}${newOrd}${internalMark || ''}`;
}

function splitToLines(lines) {
  if (typeof lines === 'string') {
    return lines.split(/\r?\n/g);
  }
  return lines;
}

function readPatchNoteFile(patchNoteFileName) {
  try {
    const lines = splitToLines(fs.readFileSync(patchNoteFileName, { encoding: 'utf8' }));
    const version = lines.shift();
    return {
      version,
      lines,
    };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return null;
  }
}

function writePatchNoteFile(patchNoteFileName, version, contents) {
  const lines = splitToLines(contents);
  const body = [version, ...lines].join('\n');
  fs.writeFileSync(patchNoteFileName, body);
}

function gitLog(previousVersion) {
  return executeCmd(`git log --oneline --merges v${previousVersion}..`, { silent: true }).stdout;
}

async function collectPullRequestMerges({ octokit, owner, repo }, previousVersion, { addAuthor }) {
  const merges = gitLog(previousVersion);

  const promises = [];
  for (const line of merges.split(/\r?\n/)) {
    const pr = line.match(/.*Merge pull request #([0-9]*).*/);
    if (!pr || pr.length < 2) {
      continue;
    }
    const pullNumber = parseInt(pr[1], 10);
    promises.push(
      octokit.pullRequests.get({ owner, repo, pull_number: pullNumber }).catch(e => {
        info(e);
        return { data: {} };
      }),
    );
  }

  function level(line) {
    if (line.startsWith('追加:')) {
      return 0;
    }
    if (line.startsWith('変更:')) {
      return 1;
    }
    if (line.startsWith('修正:')) {
      return 2;
    }
    return 3;
  }

  return Promise.all(promises).then(results => {
    const summary = [];
    for (const result of results) {
      const { data } = result;
      if ('title' in data) {
        const elements = [data.title, `(#${data.number})`];
        if (addAuthor) {
          elements.push(`by ${data.user.login}`);
        }
        summary.push(elements.join(' ') + '\n');
      }
    }

    summary.sort((a, b) => {
      const d = level(a) - level(b);
      if (d) {
        return d;
      }
      if (a < b) {
        return -1;
      }
      if (a === b) {
        return 0;
      }
      return 1;
    });

    return summary.join('');
  });
}

function generateNotesTsContent(version, title, notes) {
  const patchNote = `import { IPatchNotes } from '.';

export const notes: IPatchNotes = {
  version: '${version}',
  title: '${title}',
  notes: [
${notes
  .trim()
  .split('\n')
  .map(s => `    ${JSON.stringify(s)},`)
  .join('\n')}
  ]
};
`;
  info(`patch-note: '${patchNote}'`);
  return patchNote;
}

function updateNotesTs({ title, version, notes, filePath }) {
  const generatedPatchNote = generateNotesTsContent(title, version, notes);

  fs.writeFileSync(filePath, generatedPatchNote);
}

/**
 * @param {object} param0
 * @param {string} param0.patchNoteFileName
 * @returns {{version: string, notes: string}}
 */
function readPatchNote({ patchNoteFileName }) {
  const patchNote = readPatchNoteFile(patchNoteFileName);

  if (!patchNote) {
    error(`${patchNoteFileName} is absent. Generate it before release.`);
    throw new Error(`${patchNoteFileName} is absent.`);
  }

  return {
    version: patchNote.version,
    notes: patchNote.lines.join('\n'),
  };
}

module.exports = {
  parseVersion,
  getVersionContext,
  generateNewVersion,
  isSameVersionContext,
  validateVersionContext,
  readPatchNoteFile,
  writePatchNoteFile,
  collectPullRequestMerges,
  updateNotesTs,
  readPatchNote,
  generateNotesTsContent,
};
