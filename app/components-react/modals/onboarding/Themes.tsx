import React, { useState, useMemo } from 'react';
import styles from './Common.m.less';
import { Header, IOnboardingStepProps } from './Onboarding';
import { $t } from 'services/i18n';
import { Button, Carousel } from 'antd';
import { Services } from 'components-react/service-provider';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import { byOS, OS } from 'util/operating-systems';
import { useVuex } from 'components-react/hooks';

const THEME_MAP = {
  FREE: {
    1596: '',
    2204: '',
    2013: '',
    1614: '',
    233: '',
    632: '',
    1984: '',
    1645: '',
  },
  ULTRA: {
    7660: '',
    7898: '',
    7911: '',
    7884: '',
    7659: '',
    7697: '',
    7883: '',
    7855: '',
    7867: '',
    234: '',
  },
  ULTRA_MAC: {
    234: '',
    1987: '',
    49: '',
    85: '',
    2307: '',
    1295: '',
    1509: '',
    792: '',
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
  const [selectedTheme, setSelectedTheme] = useState<number | null>(null);

  const { isPrime } = useVuex(() => ({
    isPrime: UserService.views.isPrime,
  }));

  const themeOptions: Record<number, string> = useMemo(() => {
    if (!isPrime) return THEME_MAP.FREE;
    return byOS<Record<number, string>>({
      [OS.Windows]: THEME_MAP.ULTRA,
      [OS.Mac]: THEME_MAP.ULTRA_MAC,
    });
  }, [isPrime]);

  const detailTheme = useMemo(() => {
    return themesMetadata.find(theme => theme.data.id === selectedTheme);
  }, [selectedTheme]);

  function browseOverlays() {
    OnboardingV2Service.actions.recordOnboardingInteractionEvent('browseThemes');
    OnboardingV2Service.actions.takeStep();
    NavigationService.actions.navigate('BrowseOverlays');
  }

  async function installOverlay(opt: any) {
    const url = OnboardingService.themeUrl(detailTheme.data.id);
    setInstalling(true);
    p.setProcessing(true);
    const sub = SceneCollectionsService.downloadProgress.subscribe(progress =>
      setProgress(progress.percent * 100),
    );
    await SceneCollectionsService.installOverlay(url, detailTheme.data.name);
    sub.unsubscribe();
    setInstalling(false);
    p.setProcessing(false);
  }

  return (
    <div className={styles.centered}>
      <Header title={$t('Choose Your Overlay')} />
      {!installing && (
        <>
          <Carousel arrows={true} appendDots={() => <ThemeThumbnail />}>
            {themeOptions.map(opt => (
              <div className={styles.darkBox}>
                <div style={{ display: 'flex' }}>
                  <div></div>
                  <Button className="button button--primary" onClick={() => installOverlay(opt)}>
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

function ThemeThumbnail() {
  return <></>;
}
