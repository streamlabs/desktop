import { Menu } from './Menu';
import { $t } from 'services/i18n';
import * as remote from '@electron/remote';

export function setupGlobalContextMenuForEditableElement() {
  const win = remote.getCurrentWindow();
  win.webContents.on('context-menu', (event, params) => {
    if (!params.isEditable) return;

    const hasText = params.selectionText.trim().length > 0;
    const menu = new Menu();
    menu.append({
      label: $t('common.undo'),
      accelerator: 'Ctrl+Z',
      role: 'undo',
      enabled: params.editFlags.canUndo,
      visible: params.isEditable,
    });
    menu.append({
      label: $t('common.redo'),
      accelerator: 'Ctrl+Y',
      role: 'redo',
      enabled: params.editFlags.canRedo,
      visible: params.isEditable,
    });
    menu.append({ type: 'separator' });
    menu.append({
      label: $t('common.cut'),
      accelerator: 'Ctrl+X',
      role: 'cut',
      enabled: hasText && params.editFlags.canCut,
      visible: params.isEditable,
    });
    menu.append({
      label: $t('common.copy'),
      accelerator: 'Ctrl+C',
      role: 'copy',
      enabled: hasText && params.editFlags.canCopy,
      visible: params.isEditable,
    });
    menu.append({
      label: $t('common.paste'),
      accelerator: 'Ctrl+V',
      role: 'paste',
      enabled: params.editFlags.canPaste,
      visible: params.isEditable,
    });
    menu.append({ type: 'separator' });
    menu.append({
      label: $t('common.selectAll'),
      accelerator: 'Ctrl+A',
      role: 'selectAll',
      enabled: params.editFlags.canSelectAll,
      visible: params.isEditable,
    });
    menu.popup();
  });
}
