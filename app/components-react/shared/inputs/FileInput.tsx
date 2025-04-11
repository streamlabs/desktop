import React from 'react';
import * as remote from '@electron/remote';
import { Input, Button } from 'antd';
import { InputProps } from 'antd/lib/input';
import { InputComponent, useInput, TSlobsInputProps } from './inputs';
import InputWrapper from './InputWrapper';
import { $t } from '../../../services/i18n';

type TFileInputProps = TSlobsInputProps<
  {
    directory?: boolean;
    filters?: Electron.FileFilter[];
    save?: boolean;
    buttonContent?: React.ReactNode;
  },
  string,
  InputProps
>;

export async function showFileDialog(p: TFileInputProps) {
  if (p.save) {
    const options: Electron.SaveDialogOptions = {
      defaultPath: p.value,
      filters: p.filters,
      properties: [],
    };

    const { filePath } = await remote.dialog.showSaveDialog(options);

    if (filePath && p.onChange) {
      p.onChange(filePath);
    }
  } else {
    const options: Electron.OpenDialogOptions = {
      defaultPath: p.value,
      filters: p.filters,
      properties: [],
    };

    if (p.directory && options.properties) {
      options.properties.push('openDirectory');
    } else if (options.properties) {
      options.properties.push('openFile');
    }

    const { filePaths } = await remote.dialog.showOpenDialog(options);

    if (filePaths[0] && p.onChange) {
      p.onChange(filePaths[0]);
    }
  }
}

export const FileInput = InputComponent((p: TFileInputProps) => {
  const { wrapperAttrs, inputAttrs } = useInput('file', p);

  function handleShowFileDialog() {
    showFileDialog(p);
  }

  return (
    <InputWrapper {...wrapperAttrs}>
      <Input
        {...inputAttrs}
        onChange={val => inputAttrs?.onChange(val.target.value)}
        value={p.value}
        disabled
        addonAfter={
          <Button
            style={p.buttonContent ? { borderRadius: '4px' } : {}}
            onClick={handleShowFileDialog}
          >
            {p.buttonContent || $t('Browse')}
          </Button>
        }
      />
    </InputWrapper>
  );
});
