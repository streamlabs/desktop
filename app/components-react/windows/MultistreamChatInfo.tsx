import React from 'react';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { $t } from 'services/i18n';
import styles from './MultistreamChatInfo.m.less';
import { Row, Col } from 'antd';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { TPlatform } from 'services/platforms';
import cx from 'classnames';

export default function MultistreamChatInfo() {
  const platforms = [
    {
      icon: 'youtube',
      name: $t('YouTube'),
      read: true,
      write: true,
    },
    {
      icon: 'twitch',
      name: $t('Twitch'),
      read: true,
      write: true,
    },
    {
      icon: 'facebook',
      name: $t('Facebook Pages'),
      read: true,
      write: true,
    },
    {
      icon: 'facebook',
      name: $t('Facebook Profiles'),
      read: true,
      write: false,
    },
    {
      icon: 'twitter',
      name: $t('X (Twitter)'),
      read: true,
      write: false,
    },
    {
      icon: 'trovo',
      name: $t('Trovo'),
      read: true,
      write: false,
    },
    {
      icon: 'instagram',
      name: $t('Instagram Live'),
      read: false,
      write: false,
    },
    {
      icon: 'tiktok',
      name: $t('TikTok'),
      read: false,
      write: false,
    },
    {
      icon: 'kick',
      name: $t('Kick'),
      read: true,
      write: false,
    },
  ];

  return (
    <ModalLayout className={styles.chatInfoContainer}>
      <Row className={styles.chatInfoRow}>
        <Col span={10} className={cx(styles.chatInfoCol, styles.infoHeading)}>
          {$t('Platform')}
        </Col>
        <Col span={7} className={cx(styles.chatInfoCol, styles.infoHeading)}>
          {$t('Read')}
        </Col>
        <Col span={7} className={cx(styles.chatInfoCol, styles.infoHeading)}>
          {$t('Post Comments')}
        </Col>
      </Row>
      {platforms.map(platform => (
        <Row
          key={`${platform.name.toLowerCase().split(' ').join('-')}-chat-info`}
          className={styles.chatInfoRow}
        >
          <Col span={10} className={cx(styles.chatInfoCol, styles.platform)}>
            <PlatformLogo
              platform={platform.icon as TPlatform}
              className={cx(styles.chatPlatformIcon, styles[`platform-logo-${platform.icon}`])}
            />
            {platform.name}
          </Col>
          <Col
            span={7}
            className={cx(styles.chatInfoCol, {
              [styles.iconCheck]: platform.read,
              [styles.iconCross]: !platform.read,
            })}
          >
            <i className={platform.read ? 'icon-check-mark' : 'icon-close'} />
          </Col>
          <Col
            span={7}
            className={cx(styles.chatInfoCol, {
              [styles.iconCheck]: platform.write,
              [styles.iconCross]: !platform.write,
            })}
          >
            <i className={platform.write ? 'icon-check-mark' : 'icon-close'} />
          </Col>
        </Row>
      ))}
    </ModalLayout>
  );
}
