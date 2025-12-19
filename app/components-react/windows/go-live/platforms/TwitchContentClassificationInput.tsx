import React from 'react';
import { Select } from 'antd';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';
import { TInputLayout } from 'components-react/shared/inputs';

interface ITwitchContentClassificationInputProps {
  value: string[];
  layout?: TInputLayout;
  onChange: (value: string[]) => void;
}

export default function TwitchContentClassificationInput({
  value,
  onChange,
  layout,
}: ITwitchContentClassificationInputProps) {
  const TwitchContentClassificationService = Services.TwitchContentClassificationService;
  const { options } = useVuex(() => ({
    options: TwitchContentClassificationService.options,
  }));

  return (
    <InputWrapper label={$t('Content Classification')} layout={layout}>
      <Select
        mode="multiple"
        options={options}
        placeholder={$t('Content classification')}
        value={value}
        onChange={onChange}
        size="large"
      />
    </InputWrapper>
  );
}
