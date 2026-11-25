import React from 'react';
import { Input, Button } from 'antd';
import { InputProps } from 'antd/lib/input';
import { InputComponent, useInput, TSlobsInputProps } from './inputs';
import InputWrapper from './InputWrapper';
import { $t } from '../../../services/i18n';
import { IFileDialogOptions, showFileDialog } from '../../../util/file-dialog';

type TFileInputProps = TSlobsInputProps<
  IFileDialogOptions & {
    buttonContent?: React.ReactNode;
  },
  string,
  InputProps
>;

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
            disabled={p.disabled}
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
