import React from 'react';
import { Alert, Button } from 'antd';
import { clipboard } from 'electron';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import { TextInput, createBinding } from '../../../shared/inputs';
import Form from '../../../shared/inputs/Form';
import { CommonPlatformFields } from '../CommonPlatformFields';
import GameSelector from '../GameSelector';
import { $t } from 'services/i18n';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';

type Props = IPlatformComponentParams<'instagram'> & {
  isStreamSettingsWindow?: boolean;
};

export function InstagramEditStreamInfo(p: Props) {
  const bind = createBinding(p.value, updatedSettings =>
    p.onChange({ ...p.value, ...updatedSettings }),
  );

  const { isStreamSettingsWindow } = p;
  const streamKeyLabel = $t(isStreamSettingsWindow ? 'Stream Key' : 'Instagram Stream Key');
  const streamUrlLabel = $t(isStreamSettingsWindow ? 'Stream URL' : 'Instagram Stream URL');

  return (
    <Form name="instagram-settings">
      <TextInput
        {...bind.streamUrl}
        required
        label={streamUrlLabel}
        addonAfter={<PasteButton onPaste={bind.streamUrl.onChange} />}
      />

      <TextInput
        {...bind.streamKey}
        required
        label={streamKeyLabel}
        isPassword
        placeholder={$t('Remember to update your Stream Key')}
        addonAfter={<PasteButton onPaste={bind.streamKey.onChange} />}
      />
      {!isStreamSettingsWindow && (
        <Alert
          style={{ marginBottom: 8 }}
          message={$t(
            'Remember to open Instagram in browser and click "Go Live" to start streaming!',
          )}
          type="warning"
          showIcon
          closable
        />
      )}
    </Form>
  );
}

function PasteButton({ onPaste }: { onPaste: (text: string) => void }) {
  return (
    <Button title={$t('Paste')} onClick={() => onPaste(clipboard.readText())}>
      <i className="fa fa-paste" />
    </Button>
  );
}
