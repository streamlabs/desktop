import { $t } from 'services/i18n';
import { Menu } from 'util/menus/Menu';

export function addClipboardMenu(window: Electron.BrowserWindow) {
  window.webContents.on('context-menu', (e, params) => {
    if (params.isEditable) {
      const menu = new Menu();
      menu.append({
        id: 'Cut',
        label: $t('common.cut'),
        role: 'cut',
        accelerator: 'CommandOrControl+X',
        enabled: params.editFlags.canCut,
      });
      menu.append({
        id: 'Copy',
        label: $t('common.copy'),
        role: 'copy',
        accelerator: 'CommandOrControl+C',
        enabled: params.editFlags.canCopy,
      });
      menu.append({
        id: 'Paste',
        label: $t('common.paste'),
        role: 'paste',
        accelerator: 'CommandOrControl+V',
        enabled: params.editFlags.canPaste,
      });
      menu.popup();
    } else if (params.selectionText) {
      const menu = new Menu();
      menu.append({
        id: 'Copy',
        label: $t('common.copy'),
        role: 'copy',
        accelerator: 'CommandOrControl+C',
        enabled: params.editFlags.canCopy,
      });
      menu.popup();
    }
  });
}
