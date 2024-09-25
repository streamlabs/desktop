// @ts-check

const fs = require('node:fs');
const path = require('node:path');
const { Octokit } = require('@octokit/rest');
const sh = require('shelljs');
const colors = require('colors/safe');
const { log, info, error, input, confirm, executeCmd } = require('./scripts/prompt');
const { checkEnv, getTagCommitId } = require('./scripts/util');
const {
  getVersionContext,
  isSameVersionContext,
  generateNewVersion,
  readPatchNoteFile,
  writePatchNoteFile,
  collectPullRequestMerges,
} = require('./scripts/patchNote');

const projectRoot = path.resolve(__dirname, '..', '..');
sh.cd(projectRoot);

const pjson = JSON.parse(fs.readFileSync(path.resolve(projectRoot, 'package.json'), 'utf-8'));

async function generateRoutine({ githubTokenForReadPullRequest }) {
  info(colors.magenta('|------------------------------|'));
  info(colors.magenta('| N Air Release Note Generator |'));
  info(colors.magenta('|------------------------------|'));

  info('checking current version ...');
  const previousVersion = pjson.version;

  const baseDir = executeCmd('git rev-parse --show-cdup', { silent: true }).stdout.trim();
  const patchNoteFileName = `${baseDir}patch-note.txt`;

  info(`checking ${patchNoteFileName} ...`);
  const previousPatchNote = readPatchNoteFile(patchNoteFileName);
  if (previousPatchNote) {
    info(`patch-note.txt for ${previousPatchNote.version} found`);
    log(`${previousPatchNote.version}\n${previousPatchNote.lines.join('\n')}`);

    info(`patch-note.txt for ${previousPatchNote.version} found`);
    info(`current version: ${previousVersion}`);

    if (!(await confirm('overwrite?', false))) {
      sh.exit(1);
    }
  } else {
    info(`current version: ${previousVersion}`);
  }

  const previousVersionContext = getVersionContext(previousVersion);
  const { channel, environment } = previousVersionContext;

  log('current version', colors.cyan(previousVersion));
  log('environment', (environment === 'public' ? colors.red : colors.cyan)(environment));
  log('channel', (channel === 'stable' ? colors.red : colors.cyan)(channel));

  /** @type {import('./configs/type').ReleaseConfig} */
  // eslint-disable-next-line import/no-dynamic-require
  const config = require(`./configs/${environment}-${channel}`);

  info('checking current branch...');
  const currentBranch = executeCmd('git rev-parse --abbrev-ref HEAD').stdout.trim();
  if (currentBranch !== config.target.branch) {
    if (
      !(await confirm(
        `current branch '${currentBranch}' is not '${config.target.branch}'. continue?`,
        false,
      ))
    ) {
      sh.exit(1);
    }
  }

  const defaultVersion = generateNewVersion({
    previousVersion,
  });
  log('\nestimated version', colors.cyan(defaultVersion));

  const newVersion = await input('What should the new version number be?', defaultVersion);

  const newVersionContext = getVersionContext(newVersion);
  if (!isSameVersionContext(previousVersionContext, newVersionContext)) {
    log('version', colors.cyan(previousVersion), ' -> ', colors.cyan(newVersion));
    const environmentIsMatched =
      previousVersionContext.environment === newVersionContext.environment;
    const channelIsMatched = previousVersionContext.channel === newVersionContext.channel;
    const colorize = flag => (flag ? colors.red : colors.cyan);
    log(
      'environment:',
      colorize(!environmentIsMatched)(environmentIsMatched ? 'matched  ' : 'unmatched'),
      colorize(previousVersionContext.environment === 'public')(previousVersionContext.environment),
      '->',
      colorize(newVersionContext.environment === 'public')(newVersionContext.environment),
    );
    log(
      'channel    :',
      colorize(!channelIsMatched)(channelIsMatched ? 'matched  ' : 'unmatched'),
      colorize(previousVersionContext.channel === 'stable')(previousVersionContext.channel),
      '->',
      colorize(newVersionContext.channel === 'stable')(newVersionContext.channel),
    );

    if (!(await confirm('Version contexts are not matched. Are you sure?', false))) {
      sh.exit(0);
    }
  }

  if (getTagCommitId(`v${newVersion}`)) {
    error(`version ${newVersion} has already been released`);
    sh.exit(1);
  }

  const prMerges = await collectPullRequestMerges(
    {
      octokit: new Octokit({
        baseUrl: 'https://api.github.com',
        auth: `token ${githubTokenForReadPullRequest}`,
      }),
      owner: 'n-air-app',
      repo: 'n-air-app',
    },
    previousVersion,
    {
      addAuthor: !(environment === 'public' && channel === 'stable'),
    },
  );

  const directCommits = executeCmd(
    `git log --no-merges --first-parent --pretty=format:"%s (%t)" v${previousVersion}..`,
    {
      silent: true,
    },
  ).stdout;
  const directCommitsNotes = directCommits ? `\nDirect Commits:\n${directCommits}` : '';
  const newNotes = `${prMerges}${directCommitsNotes}`;

  writePatchNoteFile(patchNoteFileName, newVersion, newNotes);
  info(`generated ${patchNoteFileName}:`);
  log(newNotes);

  info(`Please edit ${patchNoteFileName} if needed.`);
  info('next step -> `yarn release`');
}

checkEnv('NAIR_GITHUB_TOKEN');

generateRoutine({
  githubTokenForReadPullRequest: process.env.NAIR_GITHUB_TOKEN,
}).catch(e => {
  error(e);
  sh.exit(1);
});
