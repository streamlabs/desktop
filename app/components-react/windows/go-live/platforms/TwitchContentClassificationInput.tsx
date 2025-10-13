import React from 'react';
import { Select } from 'antd';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';

interface ITwitchContentClassificationInputProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export default function TwitchContentClassificationInput({
  value,
  onChange,
}: ITwitchContentClassificationInputProps) {
  const TwitchContentClassificationService = Services.TwitchContentClassificationService;
  const { options } = useVuex(() => ({
    options: TwitchContentClassificationService.options,
  }));

  return (
    <InputWrapper label={$t('Content Classification')}>
      <Select
        mode="multiple"
        options={options}
        placeholder={$t('Content classification')}
        value={value}
        onChange={onChange}
      />
    </InputWrapper>
  );
}
