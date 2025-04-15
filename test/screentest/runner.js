require('dotenv').config();
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const uuid = require('uuid');
const recursiveReadDir = require('recursive-readdir');
const { GithubClient } = require('../../scripts/github-client');
const { exec, checkoutBranch, getCommitSHA } = require('../helpers/repo');
const {
  AWS_ACCESS_KEY,
  AWS_SECRET_KEY,
  AWS_BUCKET,
  STREAMLABS_BOT_ID,
  STREAMLABS_BOT_KEY,
  BUILD_REPOSITORY_NAME,
  BUILD_BUILDID,
  SYSTEM_JOBID,
} = process.env;
const CONFIG = require('./config.json');
const commitSHA = getCommitSHA();
const args = process.argv.slice(2);

console.log(process.env);

(async function main() {
  // prepare the dist dir
  rimraf.sync(CONFIG.dist);
  fs.mkdirSync(CONFIG.dist, { recursive: true });

  const baseBranch = await detectBaseBranchName();

  // make screenshots for each branch
  const branches = ['current', baseBranch];
  for (const branchName of branches) {
    checkoutBranch(branchName, baseBranch, CONFIG);
    exec(
      `yarn ci:tests yarn test:file ${
        CONFIG.compiledTestsDist
      }/screentest/tests/**/*.js ${args.join(' ')}`,
    );
  }
  // return to the current branch
  checkoutBranch('current', baseBranch, CONFIG);

  // compile the test folder
  exec('tsc -p test');

  // compare screenshots
  exec(`node ${CONFIG.compiledTestsDist}/screentest/comparator.js ${branches[0]} ${branches[1]}`);

  // send the status to the GitHub check and upload screenshots
  await updateCheckAndUploadScreenshots();
})().catch(async e => {
  try {
    // report a failed status to the GitHub check
    await updateCheckAndUploadScreenshots();
  } finally {
    process.exit(-1);
  }
});

async function detectBaseBranchName() {
  const commit = getCommitSHA();
  let prs = [];
  try {
    const github = await getGithubClient();
    const res = await github.getPullRequestsForCommit(commit);
    prs = res.data;
  } catch (e) {
    console.error(e);
  }
  if (!prs.length) {
    throw new Error(`No pull requests found for ${commit}`);
  }
  return prs[0].base.ref;
}

async function updateCheckAndUploadScreenshots() {
  console.log('try  updateCheckAndUploadScreenshots');
  if (!STREAMLABS_BOT_ID || !STREAMLABS_BOT_KEY) {
    console.log(
      'STREAMLABS_BOT_ID or STREAMLABS_BOT_KEY is not set. Skipping GitCheck status update',
    );
    return;
  }

  // try to read test results from the file
  let testResults = null;
  try {
    testResults = require('../../test-dist/screentest/state.json');
  } catch (e) {
    console.error('No results found for screentest');
  }

  // create a conclusion
  let conclusion = '';
  let title = '';
  if (!testResults) {
    conclusion = 'failure';
    title = 'Tests failed';
  } else if (testResults.changedScreens) {
    conclusion = 'action_required';
    title = `Changes are detected in ${testResults.changedScreens} screenshots`;
  } else {
    conclusion = 'success';
    title =
      `${testResults.totalScreens} screenshots have been checked.` +
      '\n' +
      `${testResults.newScreens} new screenshots have been found`;
  }

  // upload screenshots if any changes present
  console.log('conclusion is', conclusion);
  let screenshotsUrl = '';
  if (conclusion === 'action_required' || (testResults && testResults.newScreens > 1)) {
    screenshotsUrl = await uploadScreenshots();
  }

  console.log('Updating the GithubCheck', conclusion, title);

  const summary = `[Build Url](https://dev.azure.com/streamlabs/Streamlabs%20OBS/_build/results?buildId=${BUILD_BUILDID}&view=logs&j=${SYSTEM_JOBID})`;

  try {
    const github = await getGithubClient();
    await github.login();
    await github.postCheck({
      name: 'Screenshots',
      head_sha: commitSHA,
      conclusion,
      completed_at: new Date().toISOString(),
      details_url: screenshotsUrl || 'https://github.com/streamlabs/desktop',
      output: {
        title,
        summary,
      },
    });
  } catch (e) {
    console.log('Unable to update GithubCheck status');
    console.error(e);
  }
}

async function uploadScreenshots() {
  if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY || !AWS_BUCKET) {
    console.error('Setup AWS_ACCESS_KEY AWS_SECRET_KEY AWS_BUCKET to upload screenshots');
    return;
  }

  console.info('Uploading screenshots to the s3 bucket');
  const Bucket = AWS_BUCKET;
  const awsCredentials = new AWS.Credentials(AWS_ACCESS_KEY, AWS_SECRET_KEY);
  const s3Options = { credentials: awsCredentials };
  const s3Client = new AWS.S3(s3Options);
  const bucketDir = BUILD_BUILDID || uuid();

  try {
    const files = await recursiveReadDir(CONFIG.dist);
    for (const filePath of files) {
      console.info(`uploading ${filePath}`);
      const relativePath = path.relative(CONFIG.dist, filePath).replace('\\', '/');
      const stream = fs.createReadStream(filePath);
      const params = {
        Bucket,
        Key: `${bucketDir}/${relativePath}`,
        ContentType: 'text/html',
        ACL: 'public-read',
        Body: stream,
      };
      await s3Client.upload(params).promise();
    }
    const url = `http://${Bucket}.s3.amazonaws.com/${bucketDir}/preview.html`;
    console.info('Screenshots uploaded', url);
    return url;
  } catch (e) {
    console.error('Failed to upload screenshots');
    console.error(e);
  }
}

/**
 * returns github client in the logged-in state
 */
async function getGithubClient() {
  // AzurePipelines doesn't support multiline variables.
  // All new-line characters are replaced with `;`
  const botKey = STREAMLABS_BOT_KEY.replace(/;/g, '\n');

  const [owner, repo] = BUILD_REPOSITORY_NAME.split('/');
  const github = new GithubClient(STREAMLABS_BOT_ID, botKey, owner, repo);
  await github.login();
  return github;
}
