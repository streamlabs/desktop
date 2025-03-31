import * as remote from '@electron/remote';
import { Services } from 'components-react/service-provider';
import React, { useEffect, useMemo, useState } from 'react';
import { $t } from 'services/i18n';
import { IThemeMetadata } from 'services/onboarding';
import commonStyles from './Common.m.less';
import styles from './ThemeSelector.m.less';
import cx from 'classnames';
import { useModule } from 'slap';
import { OnboardingModule } from './Onboarding';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import { usePromise } from 'components-react/hooks';
import sortBy from 'lodash/sortBy';
import { Button } from 'antd';
import Translate from 'components-react/shared/Translate';

const MAX_SIDEBAR_THEMES = 5;

export function ThemeSelector() {
  const { OnboardingService, SceneCollectionsService, UserService } = Services;
  const { isPrime } = UserService;
  const [themesMetadata, setThemesMetadata] = useState<IThemeMetadata[]>([]);
  const [installing, setInstalling] = useState(false);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [bigPreview, setBigPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const { setProcessing, next } = useModule(OnboardingModule);

  function getFilteredMetadata() {
    if (!showDetail) {
      return themesMetadata;
    }

    return sortBy(
      themesMetadata.filter(theme => theme.data.id !== showDetail),
      ['data', 'id'],
    ).slice(0, MAX_SIDEBAR_THEMES);
  }

  const detailTheme = useMemo(() => {
    return themesMetadata.find(theme => theme.data.id === showDetail);
  }, [showDetail]);

  function previewImages(theme: IThemeMetadata) {
    if (!theme?.data) return [];
    return Object.values(theme.data.custom_images).slice(0, 3);
  }

  function focusTheme(theme: IThemeMetadata | null) {
    if (!theme) {
      setShowDetail(null);
      setBigPreview(null);
    } else {
      setShowDetail(theme.data.id);
      setBigPreview(previewImages(theme)[0]);
    }
  }

  function thumbnail(theme: any) {
    return previewImages(theme).find((img: string) => /\.png$|\.jpg$|\.jpeg$/.test(img));
  }

  async function installTheme(event: React.MouseEvent) {
    event.stopPropagation();
    if (!detailTheme) {
      return;
    }
    const url = OnboardingService.themeUrl(detailTheme.data.id);
    setInstalling(true);
    setProcessing(true);
    const sub = SceneCollectionsService.downloadProgress.subscribe(progress =>
      setProgress(progress.percent * 100),
    );
    await SceneCollectionsService.installOverlay(url, detailTheme.data.name);
    sub.unsubscribe();
    setInstalling(false);
    setProcessing(false);
    next();
  }

  usePromise(
    () => OnboardingService.actions.return.fetchThemes(),
    // @ts-ignore typescript upgrade
    p =>
      p.then(themes => {
        setThemesMetadata(themes);
      }),
  );

  useEffect(() => {
    const filteredThemes = themesMetadata;
    // Hardcoding IDs is bad, but faster to have backend return a `preferred`
    // or `featured` boolean, so we at least fallback to the first theme if
    // not found.
    // Waves (Animated)
    // TODO: can free users install this theme?
    const wavesTheme = filteredThemes.find(theme => theme.data.id === 2183);

    const featuredTheme = wavesTheme || filteredThemes[0];

    if (featuredTheme) {
      focusTheme(featuredTheme);
    }
  }, [themesMetadata]);

  return (
    <div style={{ width: '100%' }}>
      <h1 className={commonStyles.titleContainer}>{$t('Add your first theme')}</h1>

      <div className={commonStyles.subtitleContainer}>
        {$t('Try your first theme now, browse hundreds of more themes later on.')}
      </div>

      <div>
        {!installing ? (
          <div className={styles.container}>
            {bigPreview && detailTheme && (
              <>
                <div className={styles.themesSidebar}>
                  <h1>{$t('Other Themes')}</h1>

                  {getFilteredMetadata().map(theme => (
                    <div
                      className={styles.cell}
                      onClick={() => focusTheme(theme)}
                      key={theme.data.name}
                    >
                      <img className={styles.thumbnail} src={thumbnail(theme)} />
                      <div className={styles.title}>{theme.data.name}</div>
                    </div>
                  ))}
                </div>
                <div className={cx(styles.detailPanel, styles.right)}>
                  <div className={styles.detailHeader}>
                    {detailTheme.data.designer && (
                      <img className={styles.designerLogo} src={detailTheme.data.designer.avatar} />
                    )}
                    <div className={styles.themeDetails}>
                      <h1>{detailTheme.data.name}</h1>
                      {detailTheme.data.designer && (
                        <Translate
                          message={$t('by <designer>%{designerName}</designer>', {
                            designerName: detailTheme.data.designer.name,
                          })}
                        >
                          <span
                            slot="designer"
                            className={cx(styles.designerName, {
                              ['has-link']: !!detailTheme.data.designer.website,
                            })}
                            onClick={() => {
                              if (detailTheme.data.designer?.website) {
                                remote.shell.openExternal(detailTheme.data.designer.website);
                              }
                            }}
                          />
                        </Translate>
                      )}
                    </div>
                    <Button
                      shape="round"
                      size="large"
                      type="primary"
                      onClick={e => installTheme(e)}
                      disabled={installing}
                    >
                      {$t('Install')}
                    </Button>
                  </div>
                  <div className={styles.previewGrid}>
                    <ThemePreview
                      src={bigPreview}
                      className={styles.bigPreview}
                      focusPreview={() => {}}
                    />
                    {previewImages(detailTheme).map(src => {
                      return (
                        <ThemePreview
                          key={src}
                          src={src}
                          className={cx(styles.preview, { [styles.active]: src === bigPreview })}
                          focusPreview={() => setBigPreview(src)}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ margin: 'auto', marginTop: 24, width: '80%' }}>
            <AutoProgressBar percent={progress} timeTarget={60 * 1000} />
            <p>{$t('Installing overlay...')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemePreview(p: { src: string; className: string; focusPreview: () => void }) {
  const isVideo = /\.mp4$/.test(p.src);
  return isVideo ? (
    <video
      autoPlay
      muted
      loop
      src={p.src}
      className={p.className}
      onClick={e => {
        e.stopPropagation();
        p.focusPreview();
      }}
    />
  ) : (
    <img
      src={p.src}
      className={p.className}
      onClick={e => {
        e.stopPropagation();
        p.focusPreview();
      }}
    />
  );
}
