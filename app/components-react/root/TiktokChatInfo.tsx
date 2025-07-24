import * as remote from '@electron/remote';
import { Services } from '../service-provider';
import { $t } from '../../services/i18n';
import { Button } from 'antd';
import React from 'react';

export function TikTokChatInfo() {
  function openPlatformDash() {
    remote.shell.openExternal(Services.TikTokService.dashboardUrl);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: '30px',
      }}
    >
      <div style={{ marginBottom: '5px' }}>
        {$t('Access chat for TikTok in the TikTok Live Center.')}
      </div>
      <Button
        style={{
          width: '200px',
          marginBottom: '10px',
        }}
        onClick={() => openPlatformDash()}
      >
        {$t('Open TikTok Live Center')}
      </Button>
    </div>
  );
}
