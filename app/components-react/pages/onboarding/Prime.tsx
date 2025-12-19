import { useModule } from 'slap';
import React from 'react';
import { $t } from 'services/i18n';
import commonStyles from './Common.m.less';
import { OnboardingModule } from './Onboarding';
import { Services } from 'components-react/service-provider';
import { useWatchVuex } from 'components-react/hooks';
import { UltraComparison } from 'components-react/shared/UltraComparison';
import styles from './Prime.m.less';

export function Prime() {
  const { UserService, RecordingModeService } = Services;
  const { next } = useModule(OnboardingModule);
  let tableProps;

  if (RecordingModeService.views.isRecordingModeEnabled) {
    tableProps = {
      tableHeaders: [
        { text: $t('Themes and Overlays'), icon: 'icon-themes' },
        { text: $t('Streamlabs Desktop'), icon: 'icon-desktop' },
        { text: $t('Highlighter'), icon: 'icon-slice' },
        { text: $t('Storage'), icon: 'icon-cloud-backup' },
        { text: $t('Seamless Creator Workflow'), icon: 'icon-user' },
        {
          text: 'Video Editor',
          icon: 'icon-streamlabs',
          tooltip: $t('Collaborative Video Editing'),
        },
        {
          text: 'Cross Clip',
          icon: 'icon-editor-7',
          tooltip: $t('Format Clips for TikTok, Shorts, etc'),
        },
        { text: $t('Custom Branding'), icon: 'icon-creator-site' },
        { text: $t('Tipping'), icon: 'icon-donation-settings' },
        { text: $t('Merch Store'), icon: 'icon-upperwear' },
        { text: $t('Collab Cam'), icon: 'icon-team-2' },
        {
          text: $t('All Streamlabs Pro Tools'),
          icon: 'icon-streamlabs',
          whisper: 'Cross Clip, Talk Studio, Video Editor, Podcast Editor',
        },
      ],
      tableData: {
        standard: [
          { text: $t('Access to Free Overlays and Themes') },
          { text: '✓', key: 'check1' },
          { text: '✓', key: 'check2' },
          { text: '1GB' },
          { text: '✓', key: 'check3' },
          { text: $t('30 Minute Videos + 15GB Storage') },
          { text: $t('Create Custom Videos with Watermark') },
          { text: $t('Logo Maker, Intro Maker, Emote Maker') },
          { text: $t('No-Fee Tipping') },
          { text: $t('Design and Sell Custom Merch') },
          { text: $t('Add 1 Guest') },
          { text: $t('Basic Features') },
        ],
        prime: [
          {
            text: $t('Access to All Overlays and Themes (%{themeNumber})', {
              themeNumber: '1000+',
            }),
          },
          { text: '✓', key: 'check1' },
          { text: '✓', key: 'check2' },
          { text: '10GB' },
          { text: '✓', key: 'check3' },
          { text: $t('1 Hour Videos + 250GB Storage + More') },
          { text: $t('No Watermark + 1080p/60fps + More') },
          { text: $t('YouTube Thumbnail Maker, Creator Sites') },
          { text: $t('Custom Tip Page and Domain') },
          { text: $t('Highest Profit Margins') },
          { text: $t('Add Up To 11 Guests or Cameras') },
          { text: $t('Pro Upgrade') },
        ],
      },
    };
  }

  useWatchVuex(
    () => UserService.views.isPrime,
    isPrime => isPrime && next(),
  );

  return (
    <div className={styles.container}>
      <div style={{ width: '100%' }}>
        <h1 className={commonStyles.titleContainer} style={{ marginTop: '20px' }}>
          {$t('Choose your plan')}
        </h1>

        <div className={commonStyles.subtitleContainer}>
          {$t('Choose the best plan to fit your content creation needs.')}
        </div>

        <UltraComparison onSkip={next} refl="slobs-onboarding" {...tableProps} />
      </div>
    </div>
  );
}
