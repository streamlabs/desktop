import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import styles from './Common.m.less';
import { DancingKevins, IOnboardingStepProps } from './Onboarding';

export function YouTubeDualOutput(p: IOnboardingStepProps) {
  const { OnboardingV2Service, DualOutputService, UsageStatisticsService, UserService } = Services;

  function enableDualOutput() {
    if (p.processing) return;
    p.setProcessing(true);

    // Enable without popping the Video Settings window mid-onboarding.
    DualOutputService.actions.setDualOutputModeIfPossible(true, true);

    UsageStatisticsService.actions.recordFeatureUsage('DualOutput');
    UsageStatisticsService.actions.recordAnalyticsEvent('DualOutput', {
      type: 'ToggleOnDualOutput',
      source: 'Onboarding',
      isPrime: UserService.views.isPrime,
      platforms: UserService.views.linkedPlatforms,
    });

    // The processing flag is shared across all steps and is not reset between
    // them, so it must be cleared here or the next step (Devices) gets stuck.
    p.setProcessing(false);
    OnboardingV2Service.actions.takeStep();
  }

  function skip() {
    if (p.processing) return;
    OnboardingV2Service.actions.takeStep(true);
  }

  return (
    <div className={styles.centered}>
      <DancingKevins />
      <div
        className={cx(styles.darkBox, styles.centered)}
        style={{ padding: 24, width: 600, height: 360 }}
      >
        <h1>{$t('Go live in landscape and vertical at once')}</h1>
        <span>
          {$t(
            'YouTube lets you stream horizontal and vertical video simultaneously. ' +
              'Turn on Dual Output to reach viewers on desktop and mobile in a single broadcast.',
          )}
        </span>
        <Button
          onClick={enableDualOutput}
          type="primary"
          className={styles.bigButton}
          disabled={p.processing}
        >
          {$t('Enable Dual Output')}
        </Button>
        <a style={{ paddingTop: 24 }} onClick={skip}>
          {$t('Not now')}
        </a>
      </div>
    </div>
  );
}
