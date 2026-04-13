import cx from 'classnames';
import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import { SwitchInput } from 'components-react/shared/inputs';
import Scrollable from 'components-react/shared/Scrollable';
import React, { useEffect, useState } from 'react';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { getConfigByGame } from 'services/highlighter/models/game-config.models';
import { $t } from 'services/i18n/index';
import { EMenuItemKey } from 'services/side-nav';
import { IOverlayCollectionParams, TOverlayType } from 'services/user';
import { $i } from 'services/utils';
import { getOS, OS } from 'util/operating-systems';
import styles from './AILanding.m.less';

interface FeatureAction {
  text: string;
  disabled?: boolean;
  onClick: () => void;
}

interface FeatureProps {
  name: string;
  description: string;
  img: string;
  disabled?: boolean;
  actions?: FeatureAction | FeatureAction[];
}

const AGENT_APP_STORE_ID = '7643';
const AGENT_APP_ID = '93125d1c33';

function AIFeature(props: FeatureProps) {
  const actionsObj = props.actions ?? [];
  const actions = Array.isArray(actionsObj) ? actionsObj : [actionsObj];
  return (
    <div className={styles.aiFeature}>
      <h2>{props.name}</h2>
      <div className={styles.aiFeatureImage}>
        <img src={props.img} alt={props.name} />
      </div>
      <p>{props.description}</p>
      {actions.length > 0 && (
        <div className={styles.aiFeatureActions}>
          {actions.map(({ text, disabled, onClick }) => (
            <button
              key={text}
              className="button"
              disabled={props.disabled || disabled}
              onClick={onClick}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AILanding() {
  const {
    NavigationService,
    PlatformAppsService,
    SideNavService,
    UsageStatisticsService,
    VisionService,
  } = Services;
  function trackEvent(type: string, data?: Record<string, any>) {
    UsageStatisticsService.actions.recordAnalyticsEvent('AiFeature', {
      type,
      source: 'AiLanding',
      ...(data ?? {}),
    });
  }

  const visionActions = VisionService.actions;
  const visionState = useRealmObject(VisionService.state);

  const visionEnabledState = useRealmObject(VisionService.enabledState);
  const enabled = visionEnabledState.isEnabled;

  const [isAgentAppInstalled, setIsAgentAppInstalled] = useState(false);
  useEffect(() => {
    let active = true;
    let processing = false;

    void loadProductionApps();
    trackEvent('impression');

    return () => {
      active = false;
    };

    async function loadProductionApps() {
      if (getOS() !== OS.Windows) return;
      if (processing) return;

      processing = true;
      setIsAgentAppInstalled(false);
      await PlatformAppsService.actions.return.loadProductionApps();

      // Bail early if the component unmounted while we were loading.
      if (!active) return;

      const installed = PlatformAppsService.views.productionApps.some(a => a.id === AGENT_APP_ID);
      setIsAgentAppInstalled(installed);
      processing = false;
    }
  }, []);

  function onToggleAiClick(isEnabled?: boolean) {
    const newIsEnabled = isEnabled ?? !enabled;
    trackEvent('enabled', { enabled: String(newIsEnabled) });
    visionActions.setIsEnabled(newIsEnabled);
  }

  function onBrowseOverlaysClick() {
    trackEvent('browse-overlays');
    const type: TOverlayType = 'overlays';
    const params: IOverlayCollectionParams = { collection: 'reactive-overlays' };
    NavigationService.actions.navigate('BrowseOverlays', { type, ...params });
    SideNavService.actions.setCurrentMenuItem(EMenuItemKey.Themes);
  }

  function onBrowseWidgetsClick() {
    trackEvent('browse-widgets');
    const type: TOverlayType = 'widget-themes';
    const params: IOverlayCollectionParams = { collection: 'game-pulse-themes' };
    NavigationService.actions.navigate('BrowseOverlays', { type, ...params });
    SideNavService.actions.setCurrentMenuItem(EMenuItemKey.Themes);
  }

  async function onInstallAgentClick() {
    trackEvent('install-agent');
    await PlatformAppsService.actions.return.refreshProductionApps();
    NavigationService.actions.navigate('PlatformAppStore', { appId: AGENT_APP_STORE_ID });
    SideNavService.actions.setCurrentMenuItem(EMenuItemKey.AppStore);
  }

  async function onLaunchAgentClick() {
    trackEvent('launch-agent');
    await PlatformAppsService.actions.return.refreshProductionApps();
    NavigationService.actions.navigate('PlatformAppMainPage', { appId: AGENT_APP_ID });
    SideNavService.actions.setCurrentMenuItem(`sub-${AGENT_APP_ID}`);
  }

  return (
    <div className={styles.aiLandingRoot}>
      <Scrollable style={{ flexGrow: 1, width: '100%' }}>
        <div className={styles.aiLandingContents}>
          <h1 className={styles.header}>
            <i className={cx('icon-ai', styles.headerUltra)} />
            <span className={styles.headerUltraText}>{$t('Streamlabs AI:')}</span>
            <span>{$t('Real-Time, Event-Driven Streaming')}</span>
          </h1>
          <div
            className={cx(styles.aiToggle, !enabled && styles.aiToggleEmphasis)}
            onClick={() => onToggleAiClick()}
          >
            <SwitchInput
              label={$t('Turn On AI')}
              disabled={visionState.isStarting}
              value={enabled}
            />
          </div>
          <div className={styles.featureList}>
            <div className={styles.featureListInner}>
              <AIFeature
                name={$t('Reactive Overlays')}
                description={$t(
                  'Dynamic overlays powered by Streamlabs AI that react in real-time to gameplay events.',
                )}
                img={$i('images/ai/ai-reactive-overlays.png')}
                disabled={!enabled}
                actions={{ text: $t('Browse Reactive Overlays'), onClick: onBrowseOverlaysClick }}
              />
              <AIFeature
                name={$t('Game Pulse Widget')}
                description={$t(
                  'Excite your viewers with effects for your in game kills, wins, deaths and more.',
                )}
                img={$i('images/ai/ai-game-pulse.png')}
                disabled={!enabled}
                actions={{ text: $t('Add Widget'), onClick: onBrowseWidgetsClick }}
              />
              <AIFeature
                name={$t('Intelligent Streaming Agent')}
                description={$t(
                  'The Intelligent Streaming Agent is a virtual co-host, live producer, and technical assistant.',
                )}
                img={$i('images/ai/ai-streaming-agent.png')}
                disabled={!enabled}
                actions={
                  isAgentAppInstalled
                    ? { text: $t('Launch App'), onClick: onLaunchAgentClick }
                    : {
                        text: $t('Install Intelligent Streaming Agent'),
                        onClick: onInstallAgentClick,
                      }
                }
              />
            </div>
          </div>
          <div className={styles.supportedGames}>
            <h3>{$t('Supported Games:')}</h3>
            <div className={styles.supportedGameList}>
              {[
                EGame.FORTNITE,
                EGame.VALORANT,
                EGame.LEAGUE_OF_LEGENDS,
                EGame.APEX_LEGENDS,
                EGame.COUNTER_STRIKE_2,
                EGame.MARVEL_RIVALS,
                EGame.OVERWATCH_2,
                EGame.WARZONE,
                EGame.PUBG,
                EGame.BATTLEFIELD_6,
              ]
                .map(game => getConfigByGame(game))
                .filter(config => config.titleIcon && config.titleIcon !== 'unset')
                .map(config => (
                  <img key={config.name} src={config.titleIcon} alt={config.label} />
                ))}
              <img src={$i('images/ai/and-more.svg')} />
            </div>
          </div>
        </div>
      </Scrollable>
    </div>
  );
}
