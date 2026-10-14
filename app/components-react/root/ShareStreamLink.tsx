import React, { useState, useMemo } from 'react';
import { Services } from '../service-provider';
import { $t } from 'services/i18n';
import { clipboard } from 'electron';
import { getPlatformService, TPlatform } from 'services/platforms';
import { message } from 'antd';
import { CloseOutlined, ShareAltOutlined } from '@ant-design/icons';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { useVuex } from 'components-react/hooks';
import IconButton from 'components-react/shared/buttons/IconButton';

/*
 * There's a weird issue on the Live Dock where components placed above
 * chat can't overlap (even if overlaid) on top of that section.
 * As a result, our choice of components in this area is quite limited,
 * for example, dropdowns are cut off.
 * Would love to use a FloatButton with a right placement for this
 * (https://ant.design/components/float-button#float-button-demo-placement)
 * but is not included in our version of Antd. Backporting is also not feasible
 * due to 5.x using CSS in JS among other breaking changes.
 * As such, we're left with a Radio Group.
 */
export const ShareStreamLink = () => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => setExpanded(expanded => !expanded);
  const { StreamingService } = Services;

  const v = useVuex(() => ({
    enabledPlatforms: StreamingService.views.enabledPlatforms,
  }));

  const platformUrls = useMemo(
    () =>
      v.enabledPlatforms.reduce((urls, platform) => {
        const service = getPlatformService(platform);
        const streamPageUrl = service.streamPageUrl;
        if (streamPageUrl) {
          urls.push({ platform, streamPageUrl });
        }

        // See vertical stream link for YouTube
        if (platform === 'youtube' && service.verticalStreamPageUrl !== '') {
          urls.push({ platform, streamPageUrl: service.verticalStreamPageUrl! });
        }

        return urls;
      }, [] as { platform: TPlatform; streamPageUrl: string }[]),
    [v.enabledPlatforms],
  );

  const items = platformUrls.map(({ platform, streamPageUrl }, index) => {
    const tooltip = $t('Copy %{platform} link', {
      platform: StreamingService.views.getPlatformDisplayName(platform),
    });

    return (
      <IconButton
        key={`${platform}-${index}`}
        tooltipTitle={tooltip}
        tooltipPlacement="right"
        type="text"
        icon={<PlatformLogo platform={platform} size="small" />}
        label={tooltip}
        onClick={() => copyToClipboard(streamPageUrl)}
        autoAdjustOverflow={false}
      />
    );
  });

  const single = items.length < 2;

  return (
    <>
      {single ? (
        <IconButton
          tooltipTitle={$t('Copy stream link')}
          tooltipPlacement="right"
          type="text"
          icon={<ShareAltOutlined />}
          label={$t('Copy stream link')}
          onClick={() =>
            copyToClipboard(
              getPlatformService(StreamingService.views.enabledPlatforms[0]).streamPageUrl,
            )
          }
        />
      ) : (
        <>
          <IconButton
            tooltipTitle={$t('Share stream link')}
            tooltipPlacement="right"
            type="text"
            icon={expanded ? <CloseOutlined /> : <ShareAltOutlined />}
            label={$t('Share stream link')}
            onClick={() => toggleExpanded()}
          />

          <div
            style={{
              display: expanded ? 'flex' : 'none',
              alignItems: 'center',
              transition: 'all 1s ease-in-out',
            }}
          >
            {items}
          </div>
        </>
      )}
    </>
  );
};

const copyToClipboard = (link: string) => {
  clipboard.writeText(link);
  message.open({
    type: 'success',
    content: $t('Copied to clipboard'),
    duration: 2,
    /* Since there's no easy way to get this off the footer (yes, we tried
     * `getContainer`), style a bit so it doesn't get cut off
     */
    style: {
      padding: 0,
      marginTop: '-5px',
    },
  });
};
