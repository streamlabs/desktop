import React, { useState, useMemo, useEffect, useRef } from 'react';
import cx from 'classnames';
import { Header, IOnboardingStepProps } from './Onboarding';
import { $t } from 'services/i18n';
import { Button, Carousel } from 'antd';
import { Services } from 'components-react/service-provider';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import { byOS, OS } from 'util/operating-systems';
import { useVuex } from 'components-react/hooks';
import { Spinner } from 'components-react/pages/Loader';
import { IThemeMetadata } from 'services/onboarding';
import styles from './Common.m.less';
import themeS from './Themes.m.less';
import { CarouselRef } from 'antd/lib/carousel';

function isVideo(url: string) {
  return /.mp4/.test(url);
}

const THEME_MAP = {
  FREE: {
    2574: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/aa0e00a/aa0e00a.overlay',
    3216: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/5b85194/5b85194.overlay',
    3010: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/30a5873/30a5873.overlay',
    2592: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/cf2c950/cf2c950.overlay',
    515: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/45547fa/45547fa.overlay',
    1142: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/ce0222e/ce0222e.overlay',
    2979: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/30afee0/30afee0.overlay',
    2624: 'https://cdn.streamlabs.com/marketplace/overlays/4921216/483af56/483af56.overlay',
  },
  ULTRA: {
    4943: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/13a02a5/83c7a8a6-c7e6-4ab6-94dd-408cb391c9f6.overlay',
    5113: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/c9736bc/0e76a71a-5364-4d6d-9432-74fb2bc2d7a5.overlay',
    5126: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/c50aeba/f0e51b83-8933-4afc-882b-e0b8e3417751.overlay',
    5103: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/020f268/691c7cbc-e81a-4639-b20b-fa3e245153e7.overlay',
    4942: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/b833e89/0c3f584c-eaba-43ec-9486-6fd53acd766b.overlay',
    4965: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/09f396d/1452141f-d94a-4b1a-afa1-925278b5cef7.overlay',
    5102: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/0bf7570/75dcff53-6333-450e-a3af-3b8b1b4408b4.overlay',
    5076: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/2156a91/bd0ce767-9903-4d8e-89a9-810cb7dd9fd3.overlay',
    // 5087: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/b35baea/67cbfa1e-5169-41b7-8a66-c018b7ef1911.overlay',
    // 516: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/304fb75/304fb75.overlay',
  },
  ULTRA_MAC: {
    516: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/304fb75/304fb75.overlay',
    2982: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/44bbc14/44bbc14.overlay',
    135: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/e5196de/e5196de.overlay',
    184: 'https://cdn.streamlabs.com/marketplace/overlays/2116872/7c2b866/7c2b866.overlay',
    3335: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/3ed1cbb/3ed1cbb.overlay',
    2260: 'https://cdn.streamlabs.com/marketplace/overlays/60327649/8f070b6/8f070b6.overlay',
    2483: 'https://cdn.streamlabs.com/marketplace/overlays/11770422/139506a/139506a.overlay',
    1439: 'https://cdn.streamlabs.com/marketplace/overlays/7684923/14a6822/14a6822.overlay',
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
  const themeMetadata = useRef<Record<string, IThemeMetadata['data']> | null>(null);
  const thumbnailArray = useRef<{ id: string; url: string }[]>([]);
  const sliderRef = useRef<CarouselRef>(null);

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
        themeMetadata.current = {};
        metadata.forEach(({ data }) => {
          themeMetadata.current = { ...themeMetadata.current, [data.id]: data };
          const thumbnail = data.preview_images.length
            ? data.preview_images[0]
            : data.custom_images[0];
          thumbnailArray.current.push({ id: String(data.id), url: thumbnail });
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (installing) {
      const sub = SceneCollectionsService.downloadProgress.subscribe(progress =>
        setProgress(progress.percent * 100),
      );

      return sub.unsubscribe;
    }
  }, [installing]);

  function goToTheme(i: number) {
    if (!sliderRef.current) return;
    sliderRef.current.goTo(i);
  }

  function navigate(direction: 'next' | 'prev') {
    if (!sliderRef.current) return;
    if (direction === 'next') sliderRef.current.next();
    if (direction === 'prev') sliderRef.current.prev();
  }

  function browseOverlays() {
    OnboardingV2Service.actions.recordOnboardingInteractionEvent('browseThemes');
    // Themes is the last step so this completes onboarding
    OnboardingV2Service.actions.takeStep();
    NavigationService.actions.navigate('BrowseOverlays');
  }

  async function installOverlay(id: string) {
    if (!themeMetadata.current) return;
    try {
      const url = themeOptions[id];
      const name = themeMetadata.current[id].name;
      setInstalling(true);
      p.setProcessing(true);
      await SceneCollectionsService.actions.return.installOverlay(url, name);
      setInstalling(false);
      p.setProcessing(false);
      OnboardingV2Service.actions.takeStep();
    } catch (e: unknown) {
      console.error('Error installing theme', e);
      setInstalling(false);
      p.setProcessing(false);
    }
  }

  function getThumbnail(i: number) {
    if (!thumbnailArray.current) return '';
    return thumbnailArray.current[i].url;
  }

  return (
    <div className={styles.centered}>
      <Header title={$t('Choose Your Overlay')} />
      {loading && <Spinner />}
      {!loading && !installing && (
        <div className={themeS.carouselContainer}>
          <Carousel
            ref={sliderRef}
            style={{ width: '100%', height: '100%' }}
            customPaging={(i: number) => (
              <ThemeThumbnail url={getThumbnail(i)} onClick={() => goToTheme(i)} />
            )}
            arrows={false}
          >
            {idList.map(id => (
              <PreviewCard metadata={themeMetadata.current![id]} installOverlay={installOverlay} />
            ))}
          </Carousel>
          <a style={{ marginTop: 80, display: 'block' }} onClick={browseOverlays}>
            {$t('Browse All Overlays')}
          </a>
          <i onClick={() => navigate('prev')} className={cx(themeS.backArrow, 'icon-back')} />
          <i onClick={() => navigate('next')} className={cx(themeS.nextArrow, 'icon-back')} />
        </div>
      )}
      {!loading && installing && (
        <div style={{ margin: 'auto', marginTop: 24, width: '80%' }}>
          <AutoProgressBar percent={progress} timeTarget={60 * 1000} />
          <p>{$t('Installing overlay...')}</p>
        </div>
      )}
    </div>
  );
}

function PreviewCard(p: {
  metadata: IThemeMetadata['data'];
  installOverlay: (id: string) => void;
}) {
  const previews = p.metadata.preview_images.length
    ? p.metadata.preview_images
    : Object.values(p.metadata.custom_images);

  const [selectedImage, setSelectedImage] = useState(previews[0]);

  return (
    <div className={styles.darkBox} style={{ height: '100%', padding: 16 }}>
      <div className={themeS.previewHeader}>
        <img className={themeS.avatar} src={p.metadata.designer?.avatar} />
        <div style={{ marginRight: 'auto', textAlign: 'left', marginLeft: 8 }}>
          <h1>{p.metadata.name}</h1>
          <span>{$t('by %{designerName}', { designerName: p.metadata.designer?.name })}</span>
        </div>
        {p.metadata.overlay_type === 'dynamic' && (
          <span style={{ marginRight: 'auto' }}>
            <i className="icon-ai" />
            {$t('AI-powered reactions to in-game events')}
          </span>
        )}
        <Button type="primary" onClick={() => p.installOverlay(String(p.metadata?.id))}>
          {$t('Install')}
        </Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
        {isVideo(selectedImage) && (
          <video src={selectedImage} controls={false} loop className={themeS.bigPreview} />
        )}
        {!isVideo(selectedImage) && <img src={selectedImage} className={themeS.bigPreview} />}
        <div className={themeS.imgColumn}>
          {previews.slice(0, 3).map(url => (
            <div onClick={() => setSelectedImage(url)}>
              {isVideo(url) && <video src={url} controls={false} loop />}
              {!isVideo(url) && <img src={url} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeThumbnail(p: { url: string; onClick: () => void }) {
  return (
    <>
      {isVideo(p.url) && <video src={p.url} controls={false} loop onClick={p.onClick} />}
      {!isVideo(p.url) && <img src={p.url} onClick={p.onClick} />}
    </>
  );
}
