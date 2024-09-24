const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const webfont = require('webfont').default;
const sh = require('shelljs');

const writeFile = promisify(fs.writeFile);

async function main() {
  const result = await webfont({
    files: './app/fonts/glyphs/*.svg',
    fontName: 'n-air',
    formats: ['woff'],
    template: './app/styles/custom-icons.less.njk',
    templateFontPath: './app/fonts/',
    templateClassName: 'icon',
    fontHeight: 1024,
    ascent: 1024,
    normalize: true,
  });

  return Promise.all([
    writeFile(path.join('app', 'fonts', 'n-air.woff'), result.woff),
    writeFile(path.join('app', 'styles', 'custom-icons.less'), result.template),
  ]);
}

sh.cd(path.resolve(__dirname, '..'));

main().catch(console.error);
