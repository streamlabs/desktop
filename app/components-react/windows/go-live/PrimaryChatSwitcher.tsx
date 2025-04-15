import React, { useMemo } from 'react';
import { Divider } from 'antd';
import { ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import { getPlatformService, TPlatform } from 'services/platforms';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { $t } from 'services/i18n';

interface IPrimaryChatSwitcherProps {
  enabledPlatforms: TPlatform[];
  primaryChat: TPlatform;
  onSetPrimaryChat: (platform: TPlatform) => void;
  style?: React.CSSProperties;
  className?: string | undefined;
  layout?: 'vertical' | 'horizontal';
}

export default function PrimaryChatSwitcher({
  enabledPlatforms,
  primaryChat,
  onSetPrimaryChat,
  style = {},
  layout = 'vertical',
  className = undefined,
}: IPrimaryChatSwitcherProps) {
  const primaryChatOptions = useMemo(
    () =>
      enabledPlatforms.map(platform => {
        const service = getPlatformService(platform);
        return {
          label: service.displayName,
          value: platform,
        };
      }),
    [enabledPlatforms],
  );

  return (
    <div data-test="primary-chat-switcher" style={style} className={className}>
      <Divider style={{ marginBottom: '8px' }} />
      <Form layout={layout}>
        <ListInput
          name="primaryChat"
          label={$t('Primary Chat')}
          options={primaryChatOptions}
          labelRender={renderPrimaryChatOption}
          optionRender={renderPrimaryChatOption}
          value={primaryChat}
          onChange={onSetPrimaryChat}
        />
      </Form>
    </div>
  );
}

const renderPrimaryChatOption = (option: { label: string; value: TPlatform }) => {
  /*
   * TODO: antd's new version has a new Flex component that should make
   * spacing (`gap` here) more consistent. Also, less typing.
   * https://ant.design/components/flex
   */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <PlatformLogo platform={option.value} size={16} />
      <div>{option.label}</div>
    </div>
  );
};
