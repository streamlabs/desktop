// @ts-check

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const sh = require('shelljs');
const ProgressBar = require('progress');
const { info, executeCmd, error } = require('./prompt');

async function uploadS3File({ name, bucketName, filePath, keyPrefix }) {
  info(`Starting upload of ${name}...`);

  const stream = fs.createReadStream(filePath);
  const upload = new AWS.S3.ManagedUpload({
    params: {
      Bucket: bucketName,
      Key: `${keyPrefix}/${name}`,
      Body: stream,
    },
    queueSize: 1,
  });

  const bar = new ProgressBar(`${name} [:bar] :percent :etas`, {
    total: 100,
    clear: true,
  });

  upload.on('httpUploadProgress', progress => {
    bar.update(progress.loaded / progress.total);
  });

  try {
    await upload.promise();
  } catch (err) {
    error(`Upload of ${name} failed`);
    sh.echo(err);
    sh.exit(1);
  }
}

async function uploadToGithub({
  octokit,
  url,
  pathname,
  name = path.basename(pathname),
  contentType,
}) {
  info(`uploading ${name} to github...`);

  const MAX_RETRY = 3;
  for (let retry = 0; retry < MAX_RETRY; retry += 1) {
    try {
      const result = await octokit.repos.uploadReleaseAsset({
        url,
        headers: {
          'content-length': fs.statSync(pathname).size,
          'content-type': contentType,
        },
        name,
        file: fs.createReadStream(pathname),
      });
      info('done.');
      return result;
    } catch (e) {
      if ('status' in e) {
        error(`${e.name}: '${e.message}', status = ${e.status}`);
        if (e.code === 500 && e.message.indexOf('ECONNRESET') >= 0) {
          // retry
        } else {
          break;
        }
      } else {
        error(`${e.name}: ${e.message}`);
        break;
      }
    }
  }
  error('failed!');
  throw new Error('reached to a retry limit');
}

module.exports = {
  uploadS3File,
  uploadToGithub,
};
