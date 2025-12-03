import React from 'react';
import InputWrapper from '../../shared/inputs/InputWrapper';
import { Services } from '../../service-provider';
import { $t } from '../../../services/i18n';
import { Button } from 'antd';
import { useGoLiveSettings } from './useGoLiveSettings';
import { injectWatch } from 'slap';
import { TwitterOutlined } from '@ant-design/icons';
import * as remote from '@electron/remote';
import PlatformLogo from 'components-react/shared/PlatformLogo';

const TwitterIcon = TwitterOutlined;

export default function TwitterInput() {
  const { TwitterService } = Services;

  const { tweetText } = useGoLiveSettings().extend(module => {
    function getTwitterState() {
      return {
        streamTitle: module.state.commonFields.title,
      };
    }

    return {
      get streamTitle() {
        return module.state.commonFields.title;
      },

      get url() {
        return TwitterService.views.url;
      },

      tweetTextWatch: injectWatch(getTwitterState, () => {
        const tweetText = module.getTweetText(getTwitterState().streamTitle);
        module.updateSettings({ tweetText });
      }),
    };
  });

  const openTweetIntent = () =>
    remote.shell.openExternal(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText || '')}`,
    );

  return (
    <InputWrapper
      label={$t('Share Your Stream')}
      nolabel={true}
      style={{ marginTop: '15px', marginBottom: '0px', borderTop: '1px solid var(--border)' }}
    >
      <PlatformLogo platform="twitter" size={16} style={{ marginRight: '8px' }} />
      <a onClick={openTweetIntent} style={{ fontWeight: 400 }}>
        {$t('Share your stream!')}
      </a>
    </InputWrapper>
  );
}
