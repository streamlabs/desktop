import React, { HTMLAttributes } from 'react';
import { TPlatform } from '../../services/platforms';
import cx from 'classnames';
import css from './PlatformLogo.m.less';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';

export const sizeMap = {
  small: 14,
  medium: 40,
};

interface IProps {
  platform: TPlatform | 'nimotv' | 'dlive' | 'instagram' | 'streamlabs';
  size?: keyof typeof sizeMap | number;
  color?: string;
  nocolor?: boolean;
  unwrapped?: boolean;
  fontIcon?: string;
}

export default function PlatformLogo(p: IProps & HTMLAttributes<unknown>) {
  const { CustomizationService } = Services;
  const isDark = useRealmObject(CustomizationService.state).isDarkTheme;

  function iconForPlatform() {
    return {
      twitch: 'fab fa-twitch',
      youtube: 'youtube',
      facebook: 'fab fa-facebook',
      tiktok: 'tiktok',
      trovo: 'fab fa-trovo',
      dlive: 'dlive',
      nimotv: 'nimotv',
      twitter: 'twitter',
      streamlabs: 'icon-streamlabs',
      instagram: 'instagram',
      kick: 'kick',
    }[p.platform];
  }
  const size = p.size && (sizeMap[p.size] ?? p.size);
  const sizeStyle = size
    ? {
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        maxHeight: `${size}px`,
        maxWidth: `${size}px`,
      }
    : undefined;
  const colorStyle = p.color ? { color: p.color } : undefined;
  const style = { ...sizeStyle, ...colorStyle };

  let color = p.color;

  // This might be a hack - but handle twitter and tiktok logo for different themes
  if (['twitter', 'tiktok'].includes(p.platform) && !isDark) {
    color = 'black';
  }

  return (
    <>
      {p?.fontIcon ? (
        <i className={cx(`icon-${p?.fontIcon}`, p.className)} style={style} />
      ) : (
        <i
          className={cx(iconForPlatform(), !p.nocolor && css[p.platform], p.className, {
            // The platforms below don't provide an SVG, so just use different colored PNGs
            [css['trovo--black']]: p.platform === 'trovo' && p.color === 'black',
            [css['twitter--black']]: p.platform === 'twitter' && color === 'black',
            [css['tiktok--black']]: p.platform === 'tiktok' && color === 'black',
          })}
          style={style}
        />
      )}
    </>
  );
}
