import React, { useMemo } from 'react';
import { Divider } from 'antd';
import { ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import { getPlatformService, TPlatform } from 'services/platforms';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import Tooltip from 'components-react/shared/Tooltip';
import { $t } from 'services/i18n';

interface IPrimaryChatSwitcherProps {
  enabledPlatforms: TPlatform[];
  primaryChat: TPlatform;
  onSetPrimaryChat: (platform: TPlatform) => void;
  style?: React.CSSProperties;
  className?: string | undefined;
  layout?: 'vertical' | 'horizontal';
  suffixIcon?: React.ReactNode;
  tooltip?: string;
  size?: 'small' | 'middle' | 'large';
  logo?: boolean;
  border?: boolean;
}

export default function PrimaryChatSwitcher({
  enabledPlatforms,
  primaryChat,
  onSetPrimaryChat,
  style = {},
  layout = 'vertical',
  className = undefined,
  suffixIcon = undefined,
  tooltip = undefined,
  size = undefined,
  logo = true,
  border = true,
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
    <div data-name="primary-chat-switcher" style={style} className={className}>
      {border && <Divider style={{ marginBottom: '8px' }} />}
      <Form layout={layout}>
        <ListInput
          name="primaryChat"
          label={
            tooltip ? (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {`${$t('Primary Chat')}:`}
                <Tooltip title={tooltip} placement="top" lightShadow={true}>
                  <i className="icon-information" style={{ marginLeft: '10px' }} />
                </Tooltip>
              </div>
            ) : (
              `${$t('Primary Chat')}:`
            )
          }
          options={primaryChatOptions}
          labelRender={opt => renderPrimaryChatOption(opt, logo)}
          optionRender={opt => renderPrimaryChatOption(opt, logo)}
          value={primaryChat}
          onChange={onSetPrimaryChat}
          suffixIcon={suffixIcon}
          size={size}
        />
      </Form>
    </div>
  );
}

const renderPrimaryChatOption = (option: { label: string; value: TPlatform }, logo?: boolean) => {
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
      {logo && <PlatformLogo platform={option.value} size={16} />}
      <div>{option.label}</div>
    </div>
  );
};
