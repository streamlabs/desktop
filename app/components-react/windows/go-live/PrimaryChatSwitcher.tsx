import React, { useMemo } from 'react';
import { Divider } from 'antd';
import { ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import { getPlatformService, TPlatform } from 'services/platforms';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import Tooltip from 'components-react/shared/Tooltip';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { IListOption } from 'components-react/shared/inputs/ListInput';
import UltraIcon from 'components-react/shared/UltraIcon';
import styles from './GoLive.m.less';
import cx from 'classnames';

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
  disabled?: boolean;
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
  disabled = false,
}: IPrimaryChatSwitcherProps) {
  const primaryChatOptions = useMemo(
    () =>
      enabledPlatforms.reduce((platforms: IListOption<TPlatform>[], p) => {
        const service = getPlatformService(p);

        if (
          !service.hasLiveDockFeature('chat-streaming') &&
          !service.hasLiveDockFeature('chat-offline')
        ) {
          return platforms;
        }
        platforms.push({
          label: service.displayName,
          value: p,
        });
        return platforms;
      }, []),
    [enabledPlatforms],
  );

  const switcherDisabled = useMemo(() => {
    if (disabled) return false;
    return primaryChatOptions.length === 1;
  }, [disabled, primaryChatOptions]);

  return (
    <Form layout={layout}>
      <ListInput
        name="primaryChat"
        style={style}
        className={cx(className, { [styles.disabled]: switcherDisabled })}
        label={
          tooltip ? (
            <div style={{ display: 'flex', alignItems: 'center', width: 'fit-content' }}>
              {`${$t('Primary Chat')}:`}
              {!Services.UserService.views.isPrime &&
              !Services.DualOutputService.views.dualOutputMode ? (
                <UltraIcon type="badge" style={{ marginLeft: '10px' }} />
              ) : (
                <Tooltip title={tooltip} placement="top" lightShadow={true}>
                  <i className="icon-information" style={{ marginLeft: '10px' }} />
                </Tooltip>
              )}
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
        disabled={switcherDisabled}
        dropdownMatchSelectWidth={false}
        bordered={border}
      />
    </Form>
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
