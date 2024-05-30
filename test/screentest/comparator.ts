const fs = require('fs');
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');
import { getConfigsVariations, getConfig } from './utils';

const CONFIG = getConfig();
const branches = process.argv.slice(2, 4);
const [newBranchName, baseBranchName] = branches;

console.log('branches to compare:', branches);

const images = fs.readdirSync(`${CONFIG.dist}/${newBranchName}`);

interface IState {
  regressions: { [imageName: string]: IRegression };
  branches: string[];
  totalScreens: number;
  changedScreens: number;
  newScreens: number;
  config: Dictionary<any>;
  configs: Dictionary<any>[];
}

interface IRegression {
  name: string;
  baseImage: string;
  branchImage: string;
  diffImage?: string;
  isChanged: boolean;
  isNew: boolean;
  params: Dictionary<any>;
}

interface IParsedImage {
  base: any;
  branch: any;
  diff: any;
}

const parsedImages: { [imageName: string]: IParsedImage } = {};

(async function main() {
  if (!fs.existsSync(`${CONFIG.dist}/diff`)) fs.mkdirSync(`${CONFIG.dist}/diff`);

  const configs = getConfigsVariations();
  const state: IState = {
    regressions: {},
    totalScreens: 0,
    changedScreens: 0,
    newScreens: 0,
    config: CONFIG,
    configs,
    branches,
  };

  console.log('read images...');

  await new Promise<void>(resolve => {
    let parsedImagesCount = 0;

    const doneReading = (count: number) => {
      parsedImagesCount += count;
      if (parsedImagesCount / 2 === images.length) resolve();
    };

    for (const image of images) {
      state.totalScreens++;
      const baseImage = `${CONFIG.dist}/${baseBranchName}/${image}`;
      const branchImage = `${CONFIG.dist}/${newBranchName}/${image}`;
      const diffImage = `${CONFIG.dist}/diff/${image}`;
      const isNew = !fs.existsSync(baseImage);
      const [name, restFileName] = image.split('__');
      const configInd = Number(restFileName.slice(0, -4));
      const params = configs[configInd];

      state.regressions[image] = {
        name,
        baseImage,
        branchImage,
        diffImage,
        isNew,
        params,
        isChanged: false,
      };

      if (isNew) {
        state.newScreens++;
        doneReading(2);
      } else {
        parsedImages[image] = {
          base: fs
            .createReadStream(baseImage)
            .pipe(new PNG())
            .on('parsed', () => doneReading(1)),
          branch: fs
            .createReadStream(branchImage)
            .pipe(new PNG())
            .on('parsed', () => doneReading(1)),
          diff: null,
        };
      }
    }
  });

  console.log('compare images...');
  for (const image of images) {
    const regression = state.regressions[image];
    if (regression.isNew) continue;

    const parsedImage = parsedImages[image];
    const baseImage = parsedImage.base;
    parsedImage.diff = new PNG({ width: baseImage.width, height: baseImage.height });

    const numDiffPixels = pixelmatch(
      parsedImage.base.data,
      parsedImage.branch.data,
      parsedImage.diff.data,
      baseImage.width,
      baseImage.height,
      { threshold: 0.1 },
    );

    regression.isChanged = numDiffPixels > 0;

    if (regression.isChanged) state.changedScreens++;

    parsedImage.diff.pack().pipe(fs.createWriteStream(regression.diffImage));
  }

  // replace paths for images
  for (const image of images) {
    const regression = state.regressions[image];
    regression.baseImage = `${baseBranchName}/${image}`;
    regression.branchImage = `${newBranchName}/${image}`;
    regression.diffImage = `diff/${image}`;
  }

  // create a json and html reporting file

  const stateStr = JSON.stringify(state);

  fs.writeFile(`${CONFIG.dist}/state.json`, stateStr, () => {
    console.log('state.json is created');
  });

  let previewHtml = fs.readFileSync('test/screentest/preview-tpl.html').toString();
  previewHtml = previewHtml.replace('##STATE_PLACEHOLDER##', stateStr);
  fs.writeFile(`${CONFIG.dist}/preview.html`, previewHtml, () => {
    console.log('preview.html is created');
  });
})();
