import { dialog } from '@electron/remote';

export interface IFileDialogOptions {
  value?: string;
  defaultPath?: string;
  filters?: Electron.FileFilter[];
  directory?: boolean;
  save?: boolean;
  onChange?: (path: string) => unknown;
}

export async function showFileDialog(p: IFileDialogOptions) {
  const options = { defaultPath: p.value || p.defaultPath, filters: p.filters };
  if (p.save) {
    const { canceled, filePath } = await dialog.showSaveDialog({ ...options, properties: [] });
    if (!canceled && filePath) p.onChange?.(filePath);
  } else {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      ...options,
      properties: [p.directory ? 'openDirectory' : 'openFile'],
    });
    if (!canceled && filePaths[0]) p.onChange?.(filePaths[0]);
  }
}
