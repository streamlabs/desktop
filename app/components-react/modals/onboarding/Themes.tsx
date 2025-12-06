import React, { useState, useMemo, useEffect, useRef } from 'react';
import styles from './Common.m.less';
import { Header, IOnboardingStepProps } from './Onboarding';
import { $t } from 'services/i18n';
import { Button, Carousel } from 'antd';
import { Services } from 'components-react/service-provider';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import { byOS, OS } from 'util/operating-systems';
import { useVuex } from 'components-react/hooks';
import { Loader } from 'components-react/pages';
import { IThemeMetadata } from 'services/onboarding';

const THEME_MAP = {
  FREE: {
    1596: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/aa0e00a/aa0e00a.overlay',
    2204: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/5b85194/5b85194.overlay',
    2013: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/30a5873/30a5873.overlay',
    1614: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/cf2c950/cf2c950.overlay',
    233: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/45547fa/45547fa.overlay',
    632: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/ce0222e/ce0222e.overlay',
    1984: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/30afee0/30afee0.overlay',
    1645: 'https://cdn.streamlabs.com/marketplace/overlays/4921216/483af56/483af56.overlay',
  },
  ULTRA: {
    7660: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/13a02a5/83c7a8a6-c7e6-4ab6-94dd-408cb391c9f6.overlay',
    7898: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/c9736bc/0e76a71a-5364-4d6d-9432-74fb2bc2d7a5.overlay',
    7911: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/c50aeba/f0e51b83-8933-4afc-882b-e0b8e3417751.overlay',
    7884: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/020f268/691c7cbc-e81a-4639-b20b-fa3e245153e7.overlay',
    7659: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/b833e89/0c3f584c-eaba-43ec-9486-6fd53acd766b.overlay',
    7697: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/09f396d/1452141f-d94a-4b1a-afa1-925278b5cef7.overlay',
    7883: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/0bf7570/75dcff53-6333-450e-a3af-3b8b1b4408b4.overlay',
    7855: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/2156a91/bd0ce767-9903-4d8e-89a9-810cb7dd9fd3.overlay',
    7867: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/b35baea/67cbfa1e-5169-41b7-8a66-c018b7ef1911.overlay',
    234: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/304fb75/304fb75.overlay',
  },
  ULTRA_MAC: {
    234: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/304fb75/304fb75.overlay',
    1987: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/44bbc14/44bbc14.overlay',
    49: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/e5196de/e5196de.overlay',
    85: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/7c2b866/7c2b866.overlay',
    2307: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/3ed1cbb/3ed1cbb.overlay',
    1295: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/8f070b6/8f070b6.overlay',
    1509: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/139506a/139506a.overlay',
    792: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/14a6822/14a6822.overlay',
  },
};

export function Themes(p: IOnboardingStepProps) {
  const {
    OnboardingV2Service,
    OnboardingService,
    SceneCollectionsService,
    NavigationService,
    UserService,
  } = Services;

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const themeMetadata = useRef<Record<string, IThemeMetadata['data']>>({});

  const { isPrime } = useVuex(() => ({
    isPrime: UserService.views.isPrime,
  }));

  const themeOptions: Record<string, string> = useMemo(() => {
    if (!isPrime) return THEME_MAP.FREE;
    return byOS<Record<string, string>>({
      [OS.Windows]: THEME_MAP.ULTRA,
      [OS.Mac]: THEME_MAP.ULTRA_MAC,
    });
  }, [isPrime]);
  const idList = Object.keys(themeOptions);

  useEffect(() => {
    if (themeMetadata.current) return;
    Promise.all(
      idList.map(id => {
        return OnboardingService.actions.return.fetchThemeData(id);
      }),
    )
      .then(metadata => {
        console.log(metadata);
        metadata.forEach(({ data }) => {
          themeMetadata.current = { ...themeMetadata.current, [data.id]: data };
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  function browseOverlays() {
    OnboardingV2Service.actions.recordOnboardingInteractionEvent('browseThemes');
    // Themes is the last step so this completes onboarding
    OnboardingV2Service.actions.takeStep();
    NavigationService.actions.navigate('BrowseOverlays');
  }

  async function installOverlay(id: string) {
    try {
      const url = themeOptions[id];
      const name = themeMetadata.current[id].name;
      setInstalling(true);
      p.setProcessing(true);
      const sub = SceneCollectionsService.downloadProgress.subscribe(progress =>
        setProgress(progress.percent * 100),
      );
      await SceneCollectionsService.actions.return.installOverlay(url, name);
      sub.unsubscribe();
    } finally {
      setInstalling(false);
      p.setProcessing(false);
    }
  }

  if (loading) return <Loader />;

  return (
    <div className={styles.centered}>
      <Header title={$t('Choose Your Overlay')} />
      {!installing && (
        <>
          <Carousel arrows={true} appendDots={dots => <ThemeThumbnail dots={dots} />}>
            {idList.map(id => (
              <div className={styles.darkBox} key={id}>
                <div style={{ display: 'flex' }}>
                  <div></div>
                  <Button className="button button--primary" onClick={() => installOverlay(id)}>
                    {$t('Install')}
                  </Button>
                </div>
                <div style={{ display: 'flex' }}>
                  <img />
                  <div></div>
                </div>
              </div>
            ))}
          </Carousel>
          <a onClick={browseOverlays}>{$t('Browse All Overlays')}</a>
        </>
      )}
      {installing && (
        <div style={{ margin: 'auto', marginTop: 24, width: '80%' }}>
          <AutoProgressBar percent={progress} timeTarget={60 * 1000} />
          <p>{$t('Installing overlay...')}</p>
        </div>
      )}
    </div>
  );
}

function ThemeThumbnail(p: { dots: any }) {
  console.log(p.dots);
  return <></>;
}
