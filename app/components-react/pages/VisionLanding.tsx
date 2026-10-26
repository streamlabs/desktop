import { useVuex } from 'components-react/hooks';
import { AGENT_APP_ID, useAgentAppInstalled } from 'components-react/hooks/useAgentAppInstalled';
import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import Scrollable from 'components-react/shared/Scrollable';
import { Button, message, Modal, Tooltip } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { EGame } from 'services/highlighter/models/ai-highlighter.models';
import { getConfigByGame } from 'services/highlighter/models/game-config.models';
import { $t } from 'services/i18n/index';
import { ENavMenuKey } from 'services/nav-menu';
import { ESettingsCategory } from 'services/settings';
import { IOverlayCollectionParams, TOverlayType } from 'services/user';
import { $i } from 'services/utils';
import { WidgetDisplayData } from 'services/widgets';
import { WidgetType } from 'services/widgets/widgets-data';
import styles from './VisionLanding.m.less';

interface FeatureAction {
  text: string;
  html?: React.ReactNode;
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

function VisionFeature(props: FeatureProps) {
  const actionsObj = props.actions ?? [];
  const actions = Array.isArray(actionsObj) ? actionsObj : [actionsObj];
  return (
    <div className={styles.visionFeature}>
      <h2>{props.name}</h2>
      <p>{props.description}</p>
      <div className={styles.visionFeatureImage}>
        <img src={props.img} alt={props.name} />
      </div>
      {actions.length > 0 && (
        <div className={styles.visionFeatureActions}>
          {actions.map(({ text, html, disabled, onClick }) => (
            <button
              key={text}
              className="button"
              disabled={props.disabled || disabled}
              onClick={onClick}
            >
              {html || text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VisionLanding() {
  const {
    AutomationsService,
    HostsService,
    NavigationService,
    PlatformAppsService,
    ScenesService,
    SettingsService,
    SourcesService,
    UsageStatisticsService,
    UserService,
    VisionService,
    WidgetsService,
  } = Services;
  function trackEvent(type: string, data?: Record<string, any>) {
    UsageStatisticsService.actions.recordAnalyticsEvent('VisionFeature', {
      type,
      source: 'VisionLanding',
      ...(data ?? {}),
    });
  }

  const visionActions = VisionService.actions;
  const visionState = useRealmObject(VisionService.state);

  const isLoggedIn = useVuex(() => UserService.views.isLoggedIn);
  const visionEnabledState = useRealmObject(VisionService.enabledState);
  const enabled = visionEnabledState.isEnabled;

  const { sources } = useVuex(() => ({ sources: SourcesService.views.getSources() }));
  const existingGamePulseSource = useMemo(
    () =>
      sources.find(source =>
        source.isSameType({
          type: 'browser_source',
          propertiesManager: 'widget',
          widgetType: WidgetType.GamePulseWidget,
        }),
      ),
    [sources],
  );

  const { isInstalled: isAgentAppInstalled, installAgent } = useAgentAppInstalled();
  useEffect(() => {
    trackEvent('impression');
  }, []);

  function onToggleAiClick(isEnabled?: boolean) {
    if (!isLoggedIn) {
      message.error($t('Please log in to use Streamlabs Vision.'), 3);
      return;
    }
    const newIsEnabled = isEnabled ?? !enabled;
    trackEvent('enabled', { enabled: String(newIsEnabled) });
    visionActions.setIsEnabled(newIsEnabled);
  }

  function onMoreSettingsClick() {
    trackEvent('open-settings');
    SettingsService.actions.showSettings(ESettingsCategory.Vision);
  }

  function onOpenAutomationsClick() {
    trackEvent('open-automations');
    AutomationsService.actions.showAutomations();
  }

  function onBrowseOverlaysClick() {
    trackEvent('browse-overlays');
    const type: TOverlayType = 'overlays';
    const params: IOverlayCollectionParams = { collection: 'reactive-overlays' };
    NavigationService.actions.navigate('BrowseOverlays', { type, ...params }, ENavMenuKey.Themes);
  }

  const [addWidgetState, setAddWidgetState] = useState<'idle' | 'loading' | 'success'>('idle');
  const gamePulseWidgetText = useMemo(() => {
    if (addWidgetState === 'loading') return $t('Loading');
    if (addWidgetState === 'success') return $t('Added!');
    if (existingGamePulseSource) return $t('Open Widget Settings');
    return $t('Add Widget');
  }, [addWidgetState, existingGamePulseSource]);

  async function onGamePulseWidgetClick() {
    if (existingGamePulseSource) {
      trackEvent('edit-game-pulse-widget');
      SourcesService.actions.showSourceProperties(existingGamePulseSource.sourceId);
    } else {
      const activeScene = ScenesService.views.activeScene;
      trackEvent('add-game-pulse-widget', { activeScene: !!activeScene });
      if (!activeScene) return;

      const platform = UserService.views.platform?.type;
      const name = SourcesService.views.suggestName(
        WidgetDisplayData(platform)[WidgetType.GamePulseWidget].name,
      );
      const widget = await WidgetsService.actions.return.createWidget(
        WidgetType.GamePulseWidget,
        name,
      );

      // Add animation time for the button "click -> loading -> success" before opening source.
      // The actual work is near-instant, added delays are for user feedback; tweak as needed.
      setAddWidgetState('loading');
      await new Promise(resolve => setTimeout(resolve, 250));
      setAddWidgetState('success');
      await new Promise(resolve => setTimeout(resolve, 650));

      const source = widget.getSource();
      if (source?.hasProps()) {
        SourcesService.actions.showSourceProperties(source.sourceId);
      }

      setAddWidgetState('idle');
    }
  }

  async function onInstallAgentClick() {
    trackEvent('install-agent');
    await installAgent();
  }

  async function onLaunchAgentClick() {
    trackEvent('launch-agent');
    await PlatformAppsService.actions.return.refreshProductionApps();
    NavigationService.actions.navigate(
      'PlatformAppMainPage',
      { appId: AGENT_APP_ID },
      ENavMenuKey.AppStore,
    );
  }

  const showcasedGames = [
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
  ] as const;
  const [supportedGames, setAdditionalSupportedGames] = useState<Record<EGame, string>>();
  const [showMoreGamesModal, setShowMoreGamesModal] = useState(false);

  useEffect(() => {
    let active = true;
    let processing = false;

    void loadSupportedGames();
    return () => {
      active = false;
    };

    async function loadSupportedGames() {
      if (processing) return;
      processing = true;

      const supportedGamesUrl = `https://${HostsService.highlighterCdn}/configs/games.json`;

      const response = await fetch(supportedGamesUrl);
      const json = (await response.json()) as { games: { id: string; label: string }[] };

      if (!active) return;

      const gameEntries = json.games.map(g => [g.id, g.label]);
      const games = Object.fromEntries(gameEntries) as Record<EGame, string>;
      setAdditionalSupportedGames(games);

      processing = false;
    }
  }, []);

  const supportedGamesTitles = useMemo(
    () => (supportedGames ? Object.values(supportedGames) : []),
    [supportedGames],
  );

  const moreGamesTooltip = useMemo(() => {
    if (!supportedGames || Object.keys(supportedGames).length === 0) return null;

    const additionalGamesMap = new Map(Object.entries(supportedGames));
    showcasedGames.forEach(game => additionalGamesMap.delete(game));

    const filteredGames = Array.from(additionalGamesMap.values());
    const hasMore = filteredGames.length > 8;
    const visible = hasMore ? filteredGames.slice(0, 8) : filteredGames;

    return (
      <div>
        <ul className={styles.moreGamesList}>
          {visible.map(label => (
            <li>{label}</li>
          ))}
        </ul>
        {hasMore && <div className={styles.moreGamesCta}>{$t('Click to see all games')}</div>}
      </div>
    );
  }, [supportedGames]);

  return (
    <div className={styles.visionLandingRoot}>
      <Scrollable style={{ flexGrow: 1, width: '100%' }}>
        <div className={styles.visionLandingContents}>
          <div className={styles.header}>
            <div>
              <h1 className={styles.headerTitle}>
                <i className="icon-ai" />
                <span>{$t('Streamlabs Vision')}</span>
              </h1>
              <p className={styles.headerSubtitle}>
                {$t('Enhance your stream based on real-time game events.')}
              </p>
            </div>
            <div className={styles.headerActions}>
              <Button
                type="text"
                icon={<i className="icon-settings" style={{ marginRight: 8 }} />}
                onClick={onMoreSettingsClick}
              >
                {$t('More settings')}
              </Button>
              <Button
                type={enabled ? 'default' : 'primary'}
                disabled={!isLoggedIn || visionState.isStarting}
                onClick={() => onToggleAiClick()}
              >
                {enabled ? $t('Disable Vision') : $t('Turn on Vision')}
              </Button>
            </div>
          </div>
          <div className={styles.featureList}>
            <div className={styles.featureListInner}>
              <VisionFeature
                name={$t('Automations')}
                description={$t(
                  'Trigger sources, switch scenes, show instant replays and beyond triggered by game play events.',
                )}
                img={$i('images/ai/ai-automations.png')}
                disabled={!enabled}
                actions={{ text: $t('Open Automations'), onClick: onOpenAutomationsClick }}
              />
              <VisionFeature
                name={$t('Reactive Overlays')}
                description={$t(
                  'Dynamic overlays powered by Streamlabs Vision that react in real-time to gameplay events.',
                )}
                img={$i('images/ai/ai-reactive-overlays.png')}
                disabled={!enabled}
                actions={{ text: $t('Browse Reactive Overlays'), onClick: onBrowseOverlaysClick }}
              />
              <VisionFeature
                name={$t('Game Pulse Widget')}
                description={$t(
                  'Excite your viewers with effects for your in game kills, wins, deaths and more.',
                )}
                img={$i('images/ai/ai-game-pulse.png')}
                disabled={!enabled}
                actions={{
                  text: gamePulseWidgetText,
                  html:
                    addWidgetState === 'loading' ? (
                      <i className="fa fa-spinner fa-pulse" />
                    ) : undefined,
                  disabled: addWidgetState !== 'idle',
                  onClick: onGamePulseWidgetClick,
                }}
              />
              <VisionFeature
                name={$t('Sidekick')}
                description={$t(
                  'Sidekick is a virtual co-host, live producer, and technical assistant. Customize it and ask it questions while you’re live.',
                )}
                img={$i('images/ai/ai-sidekick.png')}
                disabled={!enabled}
                actions={
                  isAgentAppInstalled
                    ? { text: $t('Open App'), onClick: onLaunchAgentClick }
                    : {
                        text: $t('Install App'),
                        onClick: onInstallAgentClick,
                      }
                }
              />
            </div>
          </div>
          <Tooltip title={moreGamesTooltip}>
            <div
              className={styles.supportedGames}
              onClick={() => supportedGamesTitles.length > 0 && setShowMoreGamesModal(true)}
            >
              <h3>{$t('Supported Games:')}</h3>
              <div className={styles.supportedGamesList}>
                {showcasedGames
                  .map(game => getConfigByGame(game))
                  .filter(config => config.titleIcon && config.titleIcon !== 'unset')
                  .map(config => (
                    <span
                      key={config.name}
                      role="img"
                      aria-label={config.label}
                      className={styles.gameIcon}
                      style={{
                        maskImage: `url(${config.titleIcon})`,
                        WebkitMaskImage: `url(${config.titleIcon})`,
                      }}
                    />
                  ))}
              </div>
              <p className={styles.moreGamesText}>{$t('and hundreds more')}</p>
            </div>
          </Tooltip>
        </div>
      </Scrollable>
      <Modal
        title={$t('All Supported Games')}
        visible={showMoreGamesModal}
        onCancel={() => setShowMoreGamesModal(false)}
        footer={null}
        getContainer={false}
      >
        <ul className={styles.moreGamesList}>
          {supportedGamesTitles.map(label => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
