import * as remote from '@electron/remote';
import React from 'react';
import cx from 'classnames';
import { Progress, Button } from 'antd';
import PlatformLogo from '../../shared/PlatformLogo';
import styles from './Grow.m.less';
import { Services } from '../../service-provider';
import { ICommunityReach, IGoal, IUniversityProgress } from '../../../services/grow/grow';
import { $t } from '../../../services/i18n';

const ONE_DAY = 1000 * 60 * 60 * 24;

export function GoalCard(p: { goal: IGoal; showGoalModal?: Function }) {
  const { GrowService } = Services;
  const { title, image, type } = p.goal;

  const daysLeft = Math.round(GrowService.views.timeLeft(p.goal) / ONE_DAY);
  const goalFinished = GrowService.views.goalExpiredOrComplete(p.goal);
  const goalFinishedText =
    p.goal.progress === p.goal.total
      ? $t('This goal has been completed!')
      : $t('Time ran out for this goal. Try again or pick a new one!');

  function incrementCustomGoal() {
    GrowService.actions.incrementGoal(p.goal.type, 1);
  }

  function addGoal() {
    if (type === 'custom' && p.showGoalModal) {
      p.showGoalModal();
    } else {
      GrowService.actions.addGoal(p.goal);
    }
  }

  function removeGoal() {
    GrowService.actions.removeGoal(p.goal);
  }

  const manuallyProgressedGoal =
    image === '' ||
    !['stream_times_per_week', 'stream_hours_per_month', 'multistream_per_week'].includes(
      p.goal.type,
    );

  return (
    <div className={styles.card} key={type}>
      <strong>{title}</strong>
      {daysLeft !== Infinity && !goalFinished && (
        <span className={styles.whisper}>{$t('%{daysLeft} days left', { daysLeft })}</span>
      )}
      {p.goal.progress != null && (
        <Progress
          percent={Math.floor((p.goal.progress / p.goal.total) * 100)}
          showInfo={false}
          steps={p.goal.total}
          strokeWidth={16}
        />
      )}
      {p.goal.progress != null && manuallyProgressedGoal && !goalFinished ? (
        <Button onClick={incrementCustomGoal} type="primary">
          {$t('Progress')}
        </Button>
      ) : (
        <img src={image} />
      )}
      {goalFinished && <span>{goalFinishedText}</span>}
      {p.goal.progress == null && <Button onClick={addGoal}>{$t('Add Goal')}</Button>}
      {p.goal.progress != null && (
        <i onClick={removeGoal} className={cx('icon-close', styles.closeIcon)} />
      )}
    </div>
  );
}

export function UniversityCard(p: { progress: IUniversityProgress }) {
  let content: React.ReactNode | string = $t(
    'Professional streamers are now able to earn large amounts of money while entertaining people and creating their own brand. But how does one become a professional streamer? Streamlabs University is our answer to this question. In this course, we’ll walk you through everything you need to know to become a successful streamer and turn your passion into a profession.',
  );
  let buttonText = $t('Open Streamlabs University');
  let imageUrl = 'https://slobs-cdn.streamlabs.com/media/grow/streamlabs_university.png';

  function openLink() {
    const url = p.progress.stopped_at?.url || 'https://streamlabs.com/university';
    remote.shell.openExternal(url);
  }

  if (p.progress.enrolled && p.progress?.total_progress < 100 && p.progress.stopped_at) {
    content = <UniversityProgress progress={p.progress} />;
    buttonText = $t('Continue Learning');
    imageUrl = p.progress.stopped_at.image;
  } else if (p.progress?.total_progress === 100) {
    content = $t('You have completed Streamlabs University!');
  }
  return (
    <div className={styles.card} style={{ minWidth: '580px' }}>
      <div className={styles.cardInner}>
        <h3>{$t('Streamlabs University')}</h3>
        <span>{content}</span>
        <Button onClick={openLink}>{buttonText}</Button>
      </div>
      <img style={{ borderRadius: '8px' }} src={imageUrl} />
    </div>
  );
}

function UniversityProgress(p: { progress: IUniversityProgress }) {
  return (
    <div>
      <span>
        {$t('You cleared %{totalProgress}% of all material. Keep it up!', {
          totalProgress: p.progress.total_progress,
        })}
        <Progress
          percent={p.progress.total_progress}
          showInfo={false}
          style={{ marginRight: '16px' }}
        />
        <h3>{p.progress.stopped_at?.title}</h3>
        <span>{p.progress.stopped_at?.description}</span>
      </span>
    </div>
  );
}

export function ContentHubCard() {
  function openLink(youtube?: boolean) {
    if (youtube) {
      return remote.shell.openExternal(
        'https://www.youtube.com/playlist?list=PLNqq3_wAj1iBLgWoGw9MrM9_Ts0KewtMK',
      );
    }

    remote.shell.openExternal('https://streamlabs.com/content-hub');
  }

  return (
    <div className={styles.card} style={{ minWidth: '580px' }}>
      <div className={styles.cardInner}>
        <h3>{$t('Creator Resource Hub')}</h3>
        <span>
          {$t(
            'The Ultimate Resource For Live Streamers; The Creator Resource Hub is your one-stop-shop for everything related to live streaming. There are dozens of different categories to choose from. Learn how to set up your live stream, find new features, and stay up-to-date on all of the tools you can use to enhance your stream.',
          )}
        </span>
        <footer>
          <Button onClick={() => openLink()}>{$t('Open Resource Hub')}</Button>
          <Button onClick={() => openLink(true)}>{$t('Streamlabs on YouTube')}</Button>
        </footer>
      </div>
      <img
        className={styles.cardImage}
        src="https://slobs-cdn.streamlabs.com/media/grow/content_hub.png"
      />
    </div>
  );
}

export function PlatformCard(p: { platform: ICommunityReach }) {
  const { followers, icon } = p.platform;
  const { NavigationService } = Services;

  function platformMerge() {
    NavigationService.actions.navigate('PlatformMerge', { platform: icon });
  }

  const nameMap = {
    twitch: 'Twitch',
    facebook: 'Facebook',
    youtube: 'YouTube',
    trovo: 'Trovo',
  };
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <PlatformLogo platform={icon} className={styles.cardIcon} />
        <span className={cx(styles.title, styles[icon])}>{nameMap[icon]}</span>
      </div>
      {followers != null ? (
        <span>{$t('%{followers} followers', { followers })}</span>
      ) : (
        <Button onClick={platformMerge}>{$t('Connect')}</Button>
      )}
    </div>
  );
}

export function MultistreamCard() {
  const { MagicLinkService } = Services;

  function getPrime() {
    MagicLinkService.actions.linkToPrime('grow-community');
  }

  return (
    <div className={cx(styles.card, styles.primeCard)} onClick={getPrime}>
      <i className="icon-prime" />
      <div className={styles.cardHeader}>
        <strong>{$t('Reach more of your community with Streamlabs Multistreaming')}</strong>
      </div>
      <span>
        {$t('One of the best ways to reach a larger audience is to stream to multiple platforms')}
      </span>
      <Button type="primary">{$t('Start Multistreaming with Prime')}</Button>
    </div>
  );
}
