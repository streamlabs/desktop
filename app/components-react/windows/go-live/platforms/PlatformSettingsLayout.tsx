import React, { useMemo } from 'react';
import { TPlatform } from '../../../../services/platforms';
import { ITwitchStartStreamOptions } from '../../../../services/platforms/twitch';
import { IYoutubeStartStreamOptions } from '../../../../services/platforms/youtube';
import { IFacebookStartStreamOptions } from '../../../../services/platforms/facebook';
import { ITikTokStartStreamOptions } from '../../../../services/platforms/tiktok';
import { ITrovoStartStreamOptions } from '../../../../services/platforms/trovo';
import { IKickStartStreamOptions } from '../../../../services/platforms/kick';
import { TInputLayout } from 'components-react/shared/inputs';

export type TLayoutMode = 'singlePlatform' | 'multiplatformAdvanced' | 'multiplatformSimple';

export default function PlatformSettingsLayout(p: {
  layoutMode: TLayoutMode;
  commonFields: JSX.Element;
  requiredFields: JSX.Element;
  optionalFields?: JSX.Element;
  essentialOptionalFields?: JSX.Element;
  layout?: TInputLayout;
}) {
  const layoutItems = useMemo(
    () => [p.essentialOptionalFields, p.commonFields, p.requiredFields, p.optionalFields, p.layout],
    [p.essentialOptionalFields, p.commonFields, p.requiredFields, p.optionalFields, p.layout],
  );

  return <>{layoutItems.map(item => item)}</>;
}

export interface IPlatformSettings extends Partial<Record<TPlatform, any>> {
  twitch?: ITwitchStartStreamOptions;
  youtube?: IYoutubeStartStreamOptions;
  facebook?: IFacebookStartStreamOptions;
  tiktok?: ITikTokStartStreamOptions;
  trovo?: ITrovoStartStreamOptions;
  kick?: IKickStartStreamOptions;
}

export interface IPlatformComponentParams<T extends TPlatform> {
  onChange(newSettings: NonNullable<IPlatformSettings[T]>): unknown;
  value: NonNullable<IPlatformSettings[T]>;
  layoutMode: TLayoutMode;
  layout?: TInputLayout;
  isUpdateMode?: boolean;
  isScheduleMode?: boolean;
  enabledPlatformsCount?: number;
  isDualOutputMode?: boolean;
  isAiHighlighterEnabled?: boolean;
  isStreamShiftMode?: boolean;
  isMidStreamMode?: boolean;
}
