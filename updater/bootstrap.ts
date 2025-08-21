/**
 * Updater bootstrap:
 * Determines if the user should receive an update, and if so,
 * spawns the updater and shuts down the application. In most
 * error situations, the application will start up normally.
 */

import * as util from 'util';
import * as path from 'path';
import * as tasklist from 'tasklist';
import * as fs from 'fs';
import fetch from 'node-fetch';
import * as cp from 'child_process';
import * as semver from 'semver';
import * as crypto from 'crypto';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

/**
 * The main process provides this to the bootstrap module. It describes
 * the state of the current version, as well as how, where from, and to
 * where we should update.
 */
interface IUpdateInfo {
  baseUrl: string;
  version: string;
  exec: string[];
  cwd: string;
  waitPids: number[];
  appDir: string;
  tempDir: string;
  cacheDir: string;
  versionFileName: string;
}

/**
 * This describes the shape of a channel file (i.e. latest.json) living
 * on our update CDN.
 */
interface ILatestVersionInfo {
  /**
   * The latest available version
   */
  version: string;

  /**
   * The most recent generally available verison that is 100%
   * rollout out. If set, this will be used as the update target for
   * users who are not eligible for the latest version.
   */
  fallbackVersion?: string;

  /**
   * A random string chosen at release time that is added to the
   * update id before hashing into a release bucket to ensure we
   * rollout to a different sample of people with each release.
   */
  seed: string;

  /**
   * Determines the percentage of users this release is rolled out to
   */
  rollout: {
    /**
     * The default rollout percentage used when deciding whether to update
     */
    default: number;

    /**
     * A version-specific override that allows us to target this release at
     * people running a specific version.
     */
    [version: string]: number;
  };

  /**
   * If restricted is true, we should check with the server to determine
   * specific eligibility for this release.
   */
  restricted?: boolean;

  /**
   * What's included in the latest available version.
   */
  details: string;
}

/**
 * Generates a relatively small and uniform numeric hash of a string
 *
 * Inspired by MIT licensed: https://github.com/segment-boneyard/hash-mod
 * @param str The string to hash
 */
function hashToInt(str: string) {
  return str.split('').reduce((hash, char) => {
    return (hash * 31 * char.charCodeAt(0)) % 982451653;
  }, 7);
}

/**
 * The update id is a randomly chosen persistent id that is used
 * when determining whether a user should receive an update.
 */
async function getUpdateId(info: IUpdateInfo): Promise<string> {
  const updateIdPath = path.join(info.cacheDir, 'updateId');
  let updateId: string;

  try {
    updateId = (await readFile(updateIdPath)).toString();
  } catch (e: unknown) {
    console.log('Error reading update id. Assigning a new random update id.');

    updateId = crypto.randomBytes(8).toString('hex');

    await writeFile(updateIdPath, updateId);
  }

  console.log('Update id is', updateId);

  return updateId;
}

async function isRestrictedRolloutEligible(info: IUpdateInfo): Promise<boolean> {
  try {
    const userIdPath = path.join(info.cacheDir, 'userId');
    const userId = parseInt((await readFile(userIdPath)).toString(), 10);

    if (!userId) {
      console.log('User id not found on disk, defaulting elibility to true.');
      return true;
    }

    console.log(`Checking eligibility for user ${userId}`);

    const result = await fetch(`https://streamlabs.com/api/v5/slobs/is-rollout-eligible/${userId}`);

    if (!result.ok) {
      console.log('Got non 2xx response from rollout server, defaulting eligibility to true');
      return true;
    }

    const json = await result.json();

    if (!json || !json.success) {
      console.log('Error checking rollout eligibility. Defaulting to true');
      return true;
    }

    return json.isEligible;
  } catch (e: unknown) {
    console.log('Error checking rollout eligibility. Defaulting to true', e);
    return true;
  }
}

async function isInRolloutGroup(info: IUpdateInfo, latestVersion: ILatestVersionInfo) {
  const updateId = await getUpdateId(info);

  // Useful for debugging. This update id will always induce
  // an update regardless of rollout or seed.
  if (updateId === 'updateplz') {
    console.log('Detected update id short circuit code.');
    return true;
  }

  // Combine the update id with the seed from the server and hash into 1 of 100 buckets
  const bucket = hashToInt(`${updateId}${latestVersion.seed}`) % 100;

  console.log(`Assigned update group: ${updateId} + ${latestVersion.seed} => ${bucket}`);

  // Use version-specific rollout but fall back to default rollout
  const rollout =
    latestVersion.rollout[info.version] != null
      ? latestVersion.rollout[info.version]
      : latestVersion.rollout.default;

  console.log(`Current rollout for ${info.version} is ${rollout}%`);

  if (bucket >= rollout) return false;

  // Final check is for restricted rollout
  if (latestVersion.restricted) {
    console.log('Update is restricted. Checking eligibility.');

    if (!(await isRestrictedRolloutEligible(info))) {
      console.log('User is not eligible for restricted rollout.');
      return false;
    }
  }

  return true;
}

async function isUpdaterRunning(updaterPath: string, updaterName: string) {
  let updaterRunning = false;

  if (!fs.existsSync(updaterPath)) {
    return updaterRunning;
  }

  const processes = await tasklist();

  for (const processItem in processes) {
    if (processes[processItem].imageName === updaterName) {
      console.log(
        `Detected running updater process ${processes[processItem].imageName} - PID: ${processes[processItem].pid}`,
      );

      try {
        fs.unlinkSync(updaterPath);
      } catch (e: unknown) {
        updaterRunning = true;
      }
    }
  }

  return updaterRunning;
}

async function fetchUpdater(info: IUpdateInfo): Promise<string | null> {
  /**
   * latest-updater.exe is always the latest most stable version of the
   * updater on our update CDN.
   */
  let updaterName = 'latest-updater.exe';

  if (process.env.SLOBS_PREVIEW) {
    updaterName = 'preview-updater.exe';
  }

  const updaterPath = path.resolve(info.tempDir, updaterName);
  if (await isUpdaterRunning(updaterPath, updaterName)) {
    console.log('Updater is already running, aborting fetch.');
    return null;
  }

  const outStream = fs.createWriteStream(updaterPath);
  return new Promise((resolve, reject) => {
    fetch(`${info.baseUrl}/${updaterName}`)
      .then(response => {
        if (response.status !== 200) {
          reject(`Failed to fetch updater: status ${response.status}`);
        }
        const outPipe = response.body.pipe(outStream);
        outPipe.on('close', () => {
          resolve(updaterPath);
        });

        outPipe.on('error', error => {
          reject(error);
        });
      })
      .catch(e => {
        reject(e);
      });
  });
}

async function getLatestVersionInfo(info: IUpdateInfo): Promise<ILatestVersionInfo | null> {
  const response = await fetch(`${info.baseUrl}/${info.versionFileName}`);

  if (response.status !== 200) {
    console.log(`Failed to fetch version information - ${response.status}`);
    return null;
  }

  return response.json();
}

/**
 * Determines if the app should be updated. If the app shouldn't update,
 * this function returns false. If it should be updated, this function
 * will return a string indicating the version we should update to.
 * @param latestVersion The latest version info object
 * @param info Info about the currently running version
 */
async function shouldUpdate(
  latestVersion: ILatestVersionInfo,
  info: IUpdateInfo,
): Promise<string | false> {
  if (!latestVersion) {
    console.log('Failed to fetch latest version.');
    return false;
  }

  if (semver.eq(info.version, latestVersion.version)) {
    console.log('Already latest version.');
    return false;
  }

  if (semver.gt(info.version, latestVersion.version)) {
    // Rollbacks are not currently supported
    console.log('Latest version is less than current version. Update will not be applied.');
    return false;
  }

  if (!(await isInRolloutGroup(info, latestVersion))) {
    console.log('User is not in rollout group. Checking for fallback version.');

    // Check if there is a fallback version we can update to
    if (latestVersion.fallbackVersion) {
      if (semver.gte(info.version, latestVersion.fallbackVersion)) {
        console.log('Already on fallback version.');

        return false;
      }

      return latestVersion.fallbackVersion;
    }

    console.log('No fallback is available. Update will not be applied.');

    return false;
  }

  return latestVersion.version;
}

/**
 * Determines if an update is required and sets up and spawns
 * the update. Returns a boolean indicating whether the app
 * should exit or continue with its startup procedure.
 */
async function entry(info: IUpdateInfo) {
  console.log('Starting update check:', info);

  const latestVersion = await getLatestVersionInfo(info);

  if (!latestVersion) {
    console.log('Aborting update to due failure fetching latest version information.');
    return false;
  }

  const updateVersion = await shouldUpdate(latestVersion, info);

  if (!updateVersion) return false;

  /* App directory is required to be present!
   * The temporary directory may not exist though. */
  await mkdir(info.tempDir, { recursive: true });

  const latestVersionPath = path.join(info.tempDir, info.versionFileName);
  await writeFile(latestVersionPath, JSON.stringify(latestVersion));

  const updaterPath = await fetchUpdater(info);

  if (!updaterPath) {
    console.log('Aborting update due to updater already running.');
    return true;
  }

  /* Node, for whatever reason, decided that when you execute via
   * shell, all arguments shouldn't be quoted... it still does
   * spacing for us I guess */
  const updaterArgs = [
    '--base-url',
    `"${info.baseUrl}"`,
    '--version',
    `"${updateVersion}"`,
    '--exec',
    `"${info.exec.join(' ')}"`,
    '--cwd',
    `"${info.cwd}"`,
    '--app-dir',
    `"${info.appDir}"`,
    '--force-temp',
    '--details',
    `"${latestVersionPath}"`,
  ];

  info.waitPids.forEach(pid => {
    updaterArgs.push('-p');
    updaterArgs.push(pid.toString());
  });

  const updaterStartCommand = `start "" "${updaterPath}"`;

  console.log('Spawning updater with args:', updaterArgs);

  const updaterProcess = cp.spawn(updaterStartCommand, updaterArgs, {
    cwd: info.tempDir,
    detached: true,
    shell: true,
  });

  console.log(`Spawning updater - PID: ${updaterProcess.pid}`);

  const returnCode = await new Promise<number>(resolve => {
    updaterProcess.on('exit', resolve);
    updaterProcess.on('error', resolve);
  });

  console.log(`Updater spawn result: ${returnCode}`);

  // Allow SLOBS to exit whil the updater keeps running
  updaterProcess.unref();

  return returnCode.toString() === '0';
}

module.exports = (info: IUpdateInfo, startApp: () => void, exit: () => void) => {
  return entry(info)
    .then(shouldExit => {
      if (shouldExit) {
        console.log('Closing for update...');
        exit();
      } else {
        console.log('App will start without updating.');
        startApp();
      }
    })
    .catch(error => {
      console.log(error);
      startApp();
    });
};
