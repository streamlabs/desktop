import { injectState, useModule, mutation } from 'slap';
import { alertAsync } from 'components-react/modals';
import { Services } from 'components-react/service-provider';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import { ListInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';
import KevinSvg from 'components-react/shared/KevinSvg';
import React from 'react';
import { $t } from 'services/i18n';
import commonStyles from './Common.m.less';
import styles from './ObsImport.m.less';
import { OnboardingModule } from './Onboarding';
import { ObsImporterService } from 'app-services';

export function ObsImport() {
  const { importing, percent, isObs } = useModule(ObsImportModule);

  return (
    <div style={{ width: '100%' }}>
      <h1 className={commonStyles.titleContainer}>
        {$t(`Importing Your Existing Settings From ${isObs ? 'OBS' : 'Twitch Studio'}`)}
      </h1>
      {!importing && <PreImport />}
      {importing && (
        <div className={styles.progressBar}>
          <AutoProgressBar percent={percent} timeTarget={10 * 1000} />
        </div>
      )}
      <div className={styles.textContainer}>
        <KevinSvg />
        <div>
          {$t(
            'While we import your settings and scenes, check out these great features unique to Streamlabs',
          )}
        </div>
      </div>
      <FeatureCards />
    </div>
  );
}

function PreImport() {
  const { setProcessing, next } = useModule(OnboardingModule);
  const { profiles, selectedProfile, setSelectedProfile, startImport, isObs } = useModule(
    ObsImportModule,
  );

  return (
    <div>
      {profiles.length > 1 && (
        <div style={{ width: 400, margin: 'auto', textAlign: 'center' }}>
          <span className={styles.profileSelectTitle}>{$t('Select an OBS profile to import')}</span>
          <Form layout="inline">
            <ListInput
              style={{ width: '100%' }}
              options={profiles.map(p => ({ label: p, value: p }))}
              value={selectedProfile}
              onChange={setSelectedProfile}
              allowClear={false}
            />
          </Form>
        </div>
      )}
      <button
        className={commonStyles.optionCard}
        style={{ margin: 'auto', marginTop: 24 }}
        onClick={async () => {
          setProcessing(true);

          if (!isObs) {
            await alertAsync({
              title: $t('Twitch Studio Import'),
              content: (
                <p>
                  {$t(
                    'Importing from Twitch Studio is an experimental feature under active development. Some source types are unable to be imported, and not all settings will be carried over.',
                  )}
                </p>
              ),
              okText: $t('Start'),
              okType: 'primary',
            });
          }

          startImport()
            .then(() => {
              setProcessing(false);
              next();
            })
            .catch(() => {
              setProcessing(false);
              alertAsync(
                $t(
                  'Something went wrong while importing. Please try again or skip to the next step.',
                ),
              );
            });
        }}
      >
        <h2 style={{ color: 'var(--action-button-text)' }}>{$t('Start')}</h2>
      </button>
    </div>
  );
}

function FeatureCards() {
  const featuresMetadata: Dictionary<Dictionary<string>> = {
    appStore: {
      title: $t('App Store'),
      description: $t(
        'Check out 50+ amazing apps from independent developers, ranging from DMCA-compliant music ' +
          'to stunning overlays to more tools to engage with your community. Head over to the app store in the left ' +
          'navigation to browse our selection of free and paid apps.',
      ),
      image: 'app-store',
    },
    gameOverlay: {
      title: $t('In-game Overlay'),
      description: $t(
        'Only have one screen? Perfect! Enable our in-game overlay to make sure you catch every chat message and ' +
          'stream event that happens while you get your game on. You can enable this feature in the ‘Game Overlay’ ' +
          'tab of the settings menu.',
      ),
      image: 'game-overlay',
    },
  };

  return (
    <div className={styles.container}>
      {Object.keys(featuresMetadata).map(feature => {
        const data = featuresMetadata[feature];
        return (
          <div className={styles.card} key={feature}>
            <div>
              <h3>{data.title}</h3>
              <div>{data.description}</div>
            </div>
            <img src={require(`../../../../media/images/onboarding/${data.image}.png`)} />
          </div>
        );
      })}
    </div>
  );
}

class ObsImportModule {
  state = injectState({
    profiles: [] as string[],
    selectedProfile: '' as string | null,
    importing: false,
    percent: 0,
  });

  init() {
    if (this.isObs) {
      const service = this.importService as ObsImporterService;
      // Intentionally synchronous
      const profiles = service.getProfiles();
      this.setProfiles(profiles);
      this.setSelectedProfile(profiles[0] ?? null);
    }
  }

  get importService() {
    if (this.isObs) {
      return Services.ObsImporterService;
    } else {
      return Services.TwitchStudioImporterService;
    }
  }

  get isObs() {
    return Services.OnboardingService.state.importedFrom === 'obs';
  }

  startImport() {
    if (this.state.importing) return Promise.resolve();
    if (this.isObs && !this.state.selectedProfile) return Promise.resolve();

    this.setImporting(true);

    return this.importService
      .load(this.state.selectedProfile!)
      .then(r => {
        this.setImporting(false);
        return r;
      })
      .catch(e => {
        this.setImporting(false);
        throw e;
      });
  }

  @mutation()
  setProfiles(profiles: string[]) {
    this.state.profiles = profiles;
  }

  @mutation()
  setSelectedProfile(profile: string) {
    this.state.selectedProfile = profile;
  }

  @mutation()
  setImporting(val: boolean) {
    this.state.importing = val;
  }

  @mutation()
  setPercent(val: number) {
    this.state.percent = val;
  }
}
