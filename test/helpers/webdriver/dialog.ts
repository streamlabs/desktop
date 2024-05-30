import { getClient } from '../modules/core';

export async function dialogDismiss(buttonLabel: string) {
  // There's probably a simpler way to handle this
  await getClient().execute(
    `(() => { var _elec = require('electron'); _elec.ipcRenderer.send('__WEBDRIVER_FAKE_MESSAGE_BOX', '${buttonLabel}'); })();`,
  );
}

export async function dialogSelectPath(filePath: string) {
  const encodedFilePath = filePath.replace(/\\/g, '\\\\');
  await getClient().execute(
    `(() => { var _elec = require('electron'); _elec.ipcRenderer.send('__WEBDRIVER_FAKE_SAVE_DIALOG', '${encodedFilePath}'); })();`,
  );
}
