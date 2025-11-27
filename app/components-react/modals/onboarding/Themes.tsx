import React, { useState } from 'react';
import styles from './Common.m.less';
import { Header } from './Onboarding';
import { $t } from 'services/i18n';
import { Button, Carousel } from 'antd';
import { Services } from 'components-react/service-provider';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';

export function Themes() {
  const {
    OnboardingV2Service,
    OnboardingService,
    SceneCollectionsService,
    NavigationService,
  } = Services;

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  const themeOptions: any[] = [];

  function browseOverlays() {
    OnboardingV2Service.actions.recordOnboardingInteractionEvent('browseThemes');
    OnboardingV2Service.actions.takeStep();
    NavigationService.actions.navigate('BrowseOverlays');
  }

  async function installOverlay(opt: any) {
    // const url = OnboardingService.themeUrl(detailTheme.data.id);
    setInstalling(true);
    // setProcessing(true);
    const sub = SceneCollectionsService.downloadProgress.subscribe(progress =>
      setProgress(progress.percent * 100),
    );
    // await SceneCollectionsService.installOverlay(url, detailTheme.data.name);
    sub.unsubscribe();
    setInstalling(false);
    // setProcessing(false);
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
