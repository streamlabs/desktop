import React from 'react';
import * as remote from '@electron/remote';
import cx from 'classnames';
import { UltraComparison } from 'components-react/shared/UltraComparison';
import styles from './Ultra.m.less';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import { Services } from 'components-react/service-provider';

interface IProductInfo {
  title: string;
  description: string;
  image: string;
  link?: string;
}

export function Ultra() {
  const { UserService, RecordingModeService } = Services;

  const products: IProductInfo[] = [
    {
      title: 'Streamlabs Desktop Ultra',
      description: $t('Pro live streaming features for Windows & Mac'),
      image: 'desktop.png',
    },
    {
      title: 'Streamlabs Web Suite Ultra',
      description: $t('Develop your brand, monetize, and more'),
      image: 'web.png',
      link: 'https://streamlabs.com/login?refl=slobs-settings',
    },
    {
      title: 'Streamlabs Mobile Ultra',
      description: $t('Live stream on-the-go or mobile games from iOS & Android'),
      image: 'mobile.png',
      link: 'https://streamlabs.com/mobile-app?refl=slobs-settings',
    },
    {
      title: 'Streamlabs Console',
      description: $t('Stream from your console to Twitch without a desktop'),
      image: 'console.png',
      link: 'https://streamlabs.com/console?refl=slobs-settings',
    },
    {
      title: 'Talk Studio Pro',
      description: $t('Stream and record with guests from your browser'),
      image: 'talk-studio.png',
      link: 'https://streamlabs.com/talk-studio?refl=slobs-settings',
    },
    {
      title: 'Video Editor Pro',
      description: $t('Professional video editing and collaboration tools'),
      image: 'video-editor.png',
      link: 'http://streamlabs.com/video-editor?refl=slobs-settings',
    },
    {
      title: 'Cross Clip Pro',
      description: $t('Turn your VODs into must-see TikToks, Reels, and Shorts'),
      image: 'crossclip.png',
      link: 'https://crossclip.streamlabs.com/?refl=slobs-settings',
    },
    {
      title: 'Podcast Editor Pro',
      description: $t('Text-based editing of VOD content'),
      image: 'podcast-editor.png',
      link: 'https://podcasteditor.streamlabs.com/?refl=slobs-settings',
    },
  ];

  let tableProps;

  if (RecordingModeService.views.isRecordingModeEnabled) {
    tableProps = {
      tableHeaders: [
        { text: $t('Themes and Overlays'), icon: 'icon-themes' },
        { text: $t('Streamlabs Desktop'), icon: 'icon-desktop' },
        { text: $t('Highlighter'), icon: 'icon-slice' },
        { text: $t('Collab Cam'), icon: 'icon-team-2' },
        { text: $t('Tipping'), icon: 'icon-donation-settings' },
        { text: $t('Storage'), icon: 'icon-cloud-backup' },
        { text: $t('Custom Branding'), icon: 'icon-creator-site' },
        {
          text: 'Cross Clip',
          icon: 'icon-editor-7',
          tooltip: $t('Format Clips for TikTok, Shorts, etc'),
        },
        {
          text: 'Video Editor',
          icon: 'icon-streamlabs',
          tooltip: $t('Collaborative Video Editing'),
        },
        { text: $t('Merch Store'), icon: 'icon-upperwear' },
      ],
      tableData: {
        standard: [
          { text: $t('Access to Free Overlays and Themes') },
          { text: '✓', key: 'check1' },
          { text: '✓', key: 'check2' },
          { text: $t('Add 1 Guest') },
          { text: $t('No-Fee Tipping') },
          { text: '1GB' },
          { text: $t('Logo Maker, Intro Maker, Emote Maker') },
          { text: $t('Create Custom Videos with Watermark') },
          { text: $t('30 Minute Videos + 15GB Storage') },
          { text: $t('Design and Sell Custom Merch') },
        ],
        prime: [
          {
            text: $t('Access to All Overlays and Themes (%{themeNumber})', {
              themeNumber: '1000+',
            }),
          },
          { text: '✓', key: 'check1' },
          { text: '✓', key: 'check2' },
          { text: $t('Add Up To 11 Guests or Cameras') },
          { text: $t('Custom Tip Page and Domain') },
          { text: '10GB' },
          { text: $t('YouTube Thumbnail Maker, Creator Sites') },
          { text: $t('No Watermark + 1080p/60fps + More') },
          { text: $t('1 Hour Videos + 250GB Storage + More') },
          { text: $t('Highest Profit Margins') },
        ],
      },
    };
  }

  const isPrime = UserService.views.isPrime;

  return (
    <div>
      <div className={styles.productListContainer}>
        <div className={styles.colorBlock} />
        <h2>{$t('Streamlabs Ultra')}</h2>
        <span>
          {$t(
            'One single subscription, premium features for %{appNumber} creator apps. Access everything you need for professional live streaming, recording, video editing, highlighting, sharing, monetization, and more.',
            { appNumber: 8 },
          )}
        </span>
        <div className={styles.productGrid}>
          {products.map(product => (
            <ProductCard {...product} key={product.title} />
          ))}
        </div>
      </div>
      {!isPrime && <UltraComparison condensed refl="slobs-settings" {...tableProps} />}
    </div>
  );
}

function ProductCard(p: IProductInfo) {
  const { UsageStatisticsService } = Services;

  function linkToProduct() {
    if (!p.link) return;
    UsageStatisticsService.actions.recordClick('SettingsUltraPage', p.title);

    remote.shell.openExternal(p.link);
  }

  return (
    <div className={cx(styles.productCard, { [styles.hasLink]: !!p.link })} onClick={linkToProduct}>
      <img src={$i(`images/products/${p.image}`)} />
      <span className={styles.title}>{p.title}</span>
      <span className={styles.description}>{p.description}</span>
      {!!p.link && <span className={styles.explore}>{$t('Explore')}</span>}
    </div>
  );
}

Ultra.page = 'Ultra';
