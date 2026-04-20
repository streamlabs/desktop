import React from 'react';
import { Services } from 'components-react/service-provider';
import ModalInstallationFlow from './ModalInstallationFlow';
import PageInstallationFlow from './PageInstallationFlow';
import { EAvailableFeatures } from 'services/incremental-rollout';

interface IMigrationNoticeProps {
  variant?: 'page' | 'modal';
  onShowAllClips?: () => void;
  onCancel?: () => void;
  onInstallComplete?: () => void;
}

export default function MigrationNotice(props: IMigrationNoticeProps) {
  const { IncrementalRolloutService } = Services;
  const variant = props.variant || 'page';

  const isMigrationEnabled = IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.highlighterMigration,
  );

  if (!isMigrationEnabled) {
    return null;
  }

  function handleCancel() {
    if (props.onCancel) {
      props.onCancel();
    }
  }

  function showAllClips() {
    if (props.onShowAllClips) {
      props.onShowAllClips();
    }
  }

  if (variant === 'modal') {
    return (
      <ModalInstallationFlow onCancel={handleCancel} onInstallComplete={props.onInstallComplete} />
    );
  }

  return (
    <div style={{ paddingRight: 24, paddingBottom: 24 }}>
      <PageInstallationFlow onCancel={handleCancel} onShowAllClips={showAllClips} />
    </div>
  );
}
