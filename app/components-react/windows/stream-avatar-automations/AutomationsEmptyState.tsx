import React from 'react';
import { $t } from 'services/i18n';
import styles from './AutomationsEmptyState.m.less';

const PLACEHOLDER_IMG =
  'https://cdn-avatar-builds.streamlabs.com/assets/ISA-automation-placeholder.png';

export default function AutomationsEmptyState() {
  return (
    <div className={styles.container}>
      <img src={PLACEHOLDER_IMG} className={styles.img} alt="" />
      <h2 className={styles.title}>{$t("You don't have Automations set up yet.")}</h2>
      <p className={styles.desc}>
        {$t(
          'Get started by adding custom automations for your Intelligent Streaming Agent to react to during various gameplay situations. You can add an automation from one of our preset library of automations or build your own from scratch.',
        )}
      </p>
    </div>
  );
}
