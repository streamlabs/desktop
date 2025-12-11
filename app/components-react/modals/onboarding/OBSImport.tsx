import React, { useMemo, useState } from 'react';
import { Button } from 'antd';
import cx from 'classnames';
import styles from './Common.m.less';
import { Header, ImageCard, IOnboardingStepProps } from './Onboarding';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import { Services } from 'components-react/service-provider';
import { ListInput } from 'components-react/shared/inputs';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';

export function OBSImport(p: IOnboardingStepProps) {
  const { ObsImporterService, OnboardingV2Service } = Services;

  const [importing, setImporting] = useState(false);

  const profiles = useMemo(() => {
    return ObsImporterService.getProfiles();
  }, []);

  const [selectedProfile, setSelectedProfile] = useState(profiles[0]);

  function startImport() {
    setImporting(true);
    p.setProcessing(true);
    ObsImporterService.actions.return.load(selectedProfile).finally(() => {
      p.setProcessing(false);
      OnboardingV2Service.actions.takeStep();
    });
  }

  console.log(selectedProfile);

  return (
    <div className={styles.centered}>
      <Header
        title={$t('Import your OBS settings for a seamless setup')}
        description={$t('While that loads, explore a few key features worth checking out!')}
      />
      <div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
        <ImageCard
          metadata={{
            title: $t('Dual Output'),
            description: $t(
              'Stream in horizontal and vertical formats simultaneously to 2 destinations for free with Dual Output. Go Ultra to stream to unlimited destinations in both formats, and let our servers do the work so your PC can stream smoothly. ',
            ),
            img: $i('images/onboarding/dual-output.png'),
          }}
        />
        <ImageCard
          metadata={{
            title: $t('Reactive Overlays'),
            description: $t(
              'Exclusive Streamlabs AI powered overlays that update in real time in response to game events',
            ),
            img: $i('images/onboarding/reactive-overlays.png'),
          }}
        />
      </div>
      {!importing && (
        <>
          <ListInput
            options={profiles.map(p => ({ label: p, value: p }))}
            onChange={setSelectedProfile}
            value={selectedProfile}
            defaultValue={profiles[0]}
            allowClear={false}
            style={{ width: '240px', margin: 16, marginLeft: 6 }}
          />
          <Button
            className={cx(styles.bigButton, styles.white)}
            icon={<i className="icon-download" />}
            onClick={startImport}
          >
            {$t('Start Import')}
          </Button>
        </>
      )}
      {importing && (
        <div className={styles.progressBar}>
          <AutoProgressBar percent={0} timeTarget={10 * 1000} />
        </div>
      )}
    </div>
  );
}
