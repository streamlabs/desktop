// @ts-check
/*
 * All-in-one interactive N Air release script.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Octokit } = require('@octokit/rest');
const sh = require('shelljs');
const colors = require('colors/safe');
const yaml = require('js-yaml');
const fetch = require('node-fetch');
const { log, info, error, executeCmd } = require('./scripts/log');
const { confirm } = require('./scripts/prompt');
const { checkEnv, getTagCommitId } = require('./scripts/util');
const {
  getVersionContext,
  isSameVersionContext,
  updateNotesTs,
  readPatchNote,
} = require('./scripts/patchNote');
const { uploadS3File, uploadToGithub } = require('./scripts/uploadArtifacts');

const projectRoot = path.resolve(__dirname, '..', '..');
sh.cd(projectRoot);

const pjson = JSON.parse(fs.readFileSync(path.resolve(projectRoot, 'package.json'), 'utf-8'));

const SLACK_TEST = false; // for debug

/**
 * @param {string} filename
 */
function eslintFix(filename) {
  const gitRootDir = executeCmd('git rev-parse --show-toplevel', { silent: true }).stdout.trim();
  const eslint = path.resolve(gitRootDir, 'node_modules/.bin/eslint');
  executeCmd(`${eslint} --fix ${filename}`);
}

async function postToSlack(message) {
  const webhookUrl = process.env.NAIR_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    info('NAIR_SLACK_WEBHOOK_URL is not set. skip posting to slack.');
    return;
  }

  const payload = JSON.stringify(message);
  // executeCmd(`curl -X POST -H 'Content-type: application/json' --data '${payload}' ${webhookUrl}`);
  // use fetch instead of curl
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload,
  });

  if (!res.ok) {
    throw new Error(`failed to post to slack: ${res.status} ${res.statusText}`);
  }
}

async function postReleaseToSlack({ version, environment, channel, link, notes }) {
  await postToSlack({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Released*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${link}|*${version}* (*${environment}*, *${channel}*)>`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Patch Note',
        },
      },
    ],
    attachments: [
      {
        color: '#36a64f',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'plain_text',
              text: notes,
            },
          },
        ],
      },
    ],
  });
}

/**
 * This is the main function of the script
 * @param {object} param0
 * @param {'public' | 'internal'} param0.releaseEnvironment
 * @param {'stable' | 'unstable'} param0.releaseChannel
 * @param {object} param0.target
 * @param {string} param0.target.host
 * @param {string} param0.target.organization
 * @param {string} param0.target.repository
 * @param {string} param0.target.remote
 * @param {string} param0.target.branch
 * @param {object} param0.upload
 * @param {string} param0.upload.githubToken
 * @param {string} param0.upload.s3BucketName
 * @param {string} param0.upload.s3KeyPrefix
 * @param {object} param0.patchNote
 * @param {string} param0.patchNote.version
 * @param {string} param0.patchNote.notes
 * @param {boolean} param0.skipLocalModificationCheck
 * @param {boolean} param0.skipBuild
 * @param {boolean} param0.enableUploadToS3
 * @param {boolean} param0.enableUploadToGitHub
 */
async function runScript({
  releaseEnvironment,
  releaseChannel,
  target,
  upload,
  patchNote,

  skipLocalModificationCheck, // for DEBUG
  skipBuild, // for DEBUG

  enableUploadToS3,
  enableUploadToGitHub,
}) {
  const newVersion = patchNote.version;
  const newTag = `v${newVersion}`;

  info('Release summary:');
  log('version:', colors.cyan(patchNote.version));
  log(
    'environment: ',
    (releaseEnvironment === 'public' ? colors.red : colors.cyan)(releaseEnvironment),
  );
  log('channel: ', (releaseChannel === 'stable' ? colors.red : colors.cyan)(releaseChannel));
  log('---- ---- ---- ----');
  log('notes:', colors.cyan(patchNote.notes));
  log('---- ---- ---- ----');
  log('target:');
  log('         host:', colors.cyan(target.host));
  log(' organization:', colors.cyan(target.organization));
  log('   repository:', colors.cyan(target.repository));
  log('       remote:', colors.cyan(target.remote));
  log('       branch:', colors.cyan(target.branch));
  log('upload:');
  log('   githubHost:', colors.cyan(target.host));
  log('  githubToken:', colors.cyan(upload.githubToken));
  log(' s3BucketName:', colors.cyan(upload.s3BucketName));
  log('  s3KeyPrefix:', colors.cyan(upload.s3KeyPrefix));
  log('---- ---- ---- ----');
  info('repeat again');
  log('version:', colors.cyan(patchNote.version));
  log(
    'environment: ',
    (releaseEnvironment === 'public' ? colors.red : colors.cyan)(releaseEnvironment),
  );
  log('channel: ', (releaseChannel === 'stable' ? colors.red : colors.cyan)(releaseChannel));
  log('---- ---- ---- ----\n');

  info('checking current branch...');
  const currentBranch = executeCmd('git rev-parse --abbrev-ref HEAD').stdout.trim();
  if (currentBranch !== target.branch) {
    if (releaseEnvironment === 'public') {
      throw new Error(`branch mismatch: '${currentBranch}' is not '${target.branch}'`);
    }

    if (
      !(await confirm(
        `current branch '${currentBranch}' is not '${target.branch}'. continue?`,
        false,
      ))
    ) {
      sh.exit(1);
    }
  }

  if (!(await confirm('Are you sure to release with these configs?', false))) {
    sh.exit(1);
  }
  const skipCleaningNodeModules = !skipBuild && !(await confirm('skip cleaning node_modules?'));

  info(`check whether remote ${target.remote} exists`);
  executeCmd(`git remote get-url ${target.remote}`);

  if (!skipLocalModificationCheck) {
    info('make sure there is nothing to commit on local directory');

    executeCmd('git status'); // there should be nothing to commit
    executeCmd('git diff -s --exit-code'); // and nothing changed
  }

  info('pulling fresh repogitory...');
  executeCmd('git pull');

  const baseDir = executeCmd('git rev-parse --show-cdup', { silent: true }).stdout.trim();
  const noteFilename = `${baseDir}app/services/patch-notes/notes.ts`;

  updateNotesTs({
    filePath: noteFilename,
    title: newVersion,
    ...patchNote,
  });
  eslintFix(noteFilename);
  info(`generated patch-note file: ${noteFilename}.`);

  // update package.json with newVersion and git tag
  executeCmd(`yarn version --new-version=${newVersion}`);

  if (skipBuild) {
    info('SKIP build process since skipBuild is set...');
  } else {
    if (skipCleaningNodeModules) {
      // clean
      info('Removing old packages...');
      sh.rm('-rf', 'node_modules');
    }

    info('Installing yarn packages...');
    executeCmd('yarn install');

    info('Compiling assets...');
    executeCmd('yarn compile:production');

    info('Making the package...');
    executeCmd(`yarn package:${releaseEnvironment}-${releaseChannel}`);
  }

  info('Pushing to the repository...');
  executeCmd(`git push ${target.remote} ${target.branch}`);
  executeCmd(`git push ${target.remote} ${newTag}`);

  info(`version: ${newVersion}`);

  info('Checking artifacts...');
  const distDir = path.resolve('.', 'dist');
  const latestYmlFilePath = path.join(distDir, 'latest.yml');
  const parsedLatestYml = /** @type {{releaseNotes: string, path: string}} */ (
    yaml.load(fs.readFileSync(latestYmlFilePath, 'utf-8'))
  );

  // add releaseNotes into latest.yml
  parsedLatestYml.releaseNotes = patchNote.notes;
  fs.writeFileSync(latestYmlFilePath, yaml.dump(parsedLatestYml));

  const binaryFile = parsedLatestYml.path;
  const binaryFilePath = path.join(distDir, binaryFile);
  if (!fs.existsSync(binaryFilePath)) {
    error(`Counld not find ${path.resolve(binaryFilePath)}`);
    sh.exit(1);
  }
  const blockmapFile = `${binaryFile}.blockmap`;
  const blockmapFilePath = path.join(distDir, blockmapFile);
  if (!fs.existsSync(blockmapFilePath)) {
    error(`Counld not find ${path.resolve(blockmapFilePath)}`);
    sh.exit(1);
  }

  executeCmd(`ls -l ${binaryFilePath} ${blockmapFilePath} ${latestYmlFilePath}`);

  if (enableUploadToS3) {
    // upload to releases s3 bucket via aws-sdk...
    // s3へのアップロードは外部へ即座に公開されるため、latestYmlのアップロードは最後である必要がある
    // そうでない場合、アップロード中で存在していないファイルをlatestYmlが指す時間が発生し、
    // electron-updaterがエラーとなってしまう可能性がある

    info('uploading artifacts to s3...');
    await uploadS3File({
      name: path.basename(binaryFilePath),
      bucketName: upload.s3BucketName,
      filePath: binaryFilePath,
      keyPrefix: upload.s3KeyPrefix,
    });
    await uploadS3File({
      name: path.basename(blockmapFilePath),
      bucketName: upload.s3BucketName,
      filePath: blockmapFilePath,
      keyPrefix: upload.s3KeyPrefix,
    });
    await uploadS3File({
      name: path.basename(latestYmlFilePath),
      bucketName: upload.s3BucketName,
      filePath: latestYmlFilePath,
      keyPrefix: upload.s3KeyPrefix,
    });
  } else {
    info('uploading artifacts to s3: SKIP');
  }

  // upload to the github directly via GitHub API...

  if (enableUploadToGitHub) {
    const octokit = new Octokit({
      baseUrl: target.host,
      auth: `token ${upload.githubToken}`,
    });

    info(`creating release ${newTag}...`);
    const draft = false;
    const releaseParams = {
      owner: target.organization,
      repo: target.repository,
      tag_name: newTag,
      name: newTag,
      body: patchNote.notes,
      draft,
      prerelease: releaseChannel !== 'stable',
    };

    /**
     * @type { import('@octokit/rest').RestEndpointMethodTypes["repos"]["createRelease"]["response"] |
     *  import('@octokit/rest').RestEndpointMethodTypes["repos"]["updateRelease"]["response"]
     * }
     */
    let result = await octokit.repos.createRelease({
      ...releaseParams,
      draft: true,
    });

    await uploadToGithub({
      octokit,
      owner: releaseParams.owner,
      repo: releaseParams.repo,
      release_id: result.data.id,
      url: result.data.upload_url,
      pathname: latestYmlFilePath,
      contentType: 'application/json',
    });

    await uploadToGithub({
      octokit,
      owner: releaseParams.owner,
      repo: releaseParams.repo,
      release_id: result.data.id,
      url: result.data.upload_url,
      pathname: blockmapFilePath,
      contentType: 'application/octet-stream',
    });

    await uploadToGithub({
      octokit,
      owner: releaseParams.owner,
      repo: releaseParams.repo,
      release_id: result.data.id,
      url: result.data.upload_url,
      pathname: binaryFilePath,
      contentType: 'application/octet-stream',
    });

    if (!draft) {
      info(`publishing release ${newTag}...`);
      const release_id = result.data.id;
      result = await octokit.repos.updateRelease({
        ...releaseParams,
        release_id,
        draft: false,
      });
    }

    // open release edit page on github
    const editUrl = draft ? result.data.html_url.replace('/tag/', '/edit/') : result.data.html_url;
    executeCmd(`start ${editUrl}`);
    await postReleaseToSlack({
      version: newVersion,
      environment: releaseEnvironment,
      channel: releaseChannel,
      link: editUrl,
      notes: patchNote.notes,
    });

    info(`finally, release Version ${newVersion} on the browser!`);
  } else {
    info('uploading to GitHub: SKIP');
  }

  // done.
}

async function releaseRoutine() {
  info(colors.magenta('|----------------------------------|'));
  info(colors.magenta('| N Air Interactive Release Script |'));
  info(colors.magenta('|----------------------------------|'));

  checkEnv('SENTRY_AUTH_TOKEN');
  checkEnv('AWS_ACCESS_KEY_ID');
  checkEnv('AWS_SECRET_ACCESS_KEY');
  checkEnv('AWS_REGION');

  const baseDir = executeCmd('git rev-parse --show-cdup', { silent: true }).stdout.trim();
  const patchNoteFileName = `${baseDir}patch-note.txt`;

  info(`checking ${patchNoteFileName} ...`);
  const patchNote = readPatchNote({ patchNoteFileName });
  if (!patchNote) {
    error(`patchNote is not found in ${patchNoteFileName}.`);
    info('Use `yarn patch-note` to generate patchNote.');
    throw new Error(`patchNote is not found in ${patchNoteFileName}.`);
  }

  const nextVersion = patchNote.version;
  info(`patch-note.txt for ${nextVersion} found`);

  const newVersionContext = getVersionContext(nextVersion);
  const { channel, environment } = newVersionContext;

  /** @type {import('./configs/type').ReleaseConfig} */
  // eslint-disable-next-line import/no-dynamic-require
  const config = require(`./configs/${environment}-${channel}`);

  info('checking current version ...');
  const previousVersion = pjson.version;
  const previousVersionContext = getVersionContext(previousVersion);

  if (!isSameVersionContext(previousVersionContext, newVersionContext)) {
    const msg = `previous version ${previousVersion} and releasing version ${nextVersion} have different context.`;
    if (process.env.NAIR_IGNORE_VERSION_CONTEXT_CHECK) {
      if (!(await confirm(`${msg} Are you sure?`, false))) {
        sh.exit(1);
      }
    } else {
      error(msg);
      log(
        'if you wish to release the first release of a new channel or environment, set "NAIR_IGNORE_VERSION_CONTEXT_CHECK".',
      );
      throw new Error(msg);
    }
  }

  const tagCommitId = getTagCommitId(`v${nextVersion}`);
  if (tagCommitId) {
    error(`Tag "v${nextVersion}" has already been released: commit ${tagCommitId}.`);
    info('Generate new patchNote with new version.');
    info('If you want to retry current release, remove the tag and related release commit.');
    if (!(await confirm(`Do you want to remove the tag and revert ${tagCommitId}?`, false))) {
      sh.exit(1);
    }
    // revert last commit
    log(`reverting ${tagCommitId} ...`);
    executeCmd(`git revert --no-edit ${tagCommitId}`);
    // remove tag
    log(`removing tag v${nextVersion} ...`);
    executeCmd(`git tag -d v${nextVersion}`);
    // remove tag from remote
    log(`removing tag v${nextVersion} from remote ...`);
    executeCmd(`git push ${config.target.remote} :v${nextVersion} || true`); // ignore error
  }

  await runScript({
    patchNote,
    releaseEnvironment: environment,
    releaseChannel: channel,
    ...config,
    skipLocalModificationCheck: false,
    skipBuild: false,
    enableUploadToS3: true,
    enableUploadToGitHub: true,
  });
}

if (SLACK_TEST) {
  postReleaseToSlack({
    version: '1.0.0',
    environment: 'public',
    channel: 'stable',
    link: 'https://example.com',
    notes: `
 * test
 * test 2 #123
`,
  });
} else if (!module.parent) {
  releaseRoutine().catch(e => {
    error(e);
    sh.exit(1);
  });
}
