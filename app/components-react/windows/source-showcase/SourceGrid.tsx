import React, { useMemo, useState } from 'react';
import { Empty, Row, Col, PageHeader, Button, Collapse } from 'antd';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { IObsListOption } from 'components/obs/inputs/ObsInput';
import { WidgetDisplayData, WidgetType } from 'services/widgets';
import { TSourceType, SourceDisplayData } from 'services/sources';
import { getPlatformService } from 'services/platforms';
import { $i } from 'services/utils';
import { byOS, getOS, OS } from 'util/operating-systems';
import { $t, I18nService } from 'services/i18n';
import SourceTag from './SourceTag';
import { useSourceShowcaseSettings } from './useSourceShowcase';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { useRealmObject } from 'components-react/hooks/realm';
import styles from './SourceGrid.m.less';

export default function SourceGrid(p: { activeTab: string }) {
  const {
    SourcesService,
    UserService,
    ScenesService,
    WindowsService,
    CustomizationService,
    IncrementalRolloutService,
  } = Services;

  // TODO: persistence
  const [expandedSections, setExpandedSections] = useState([
    'essentialSources',
    'captureSources',
    'avSources',
    'mediaSources',
    'widgets',
    'apps',
  ]);

  const [widgetSections, setWidgetExpandedSections] = useState([
    'essentialWidgets',
    'interactive',
    'goals',
    'flair',
  ]);

  const { isLoggedIn, linkedPlatforms, primaryPlatform } = useVuex(() => ({
    isLoggedIn: UserService.views.isLoggedIn,
    linkedPlatforms: UserService.views.linkedPlatforms,
    primaryPlatform: UserService.views.platform?.type,
  }));

  const customization = useRealmObject(CustomizationService.state);
  const demoMode = customization.isDarkTheme ? 'night' : 'day';
  const designerMode = customization.designerMode;

  /**
   * English and languages with logographic writing systems
   * generally have shorter strings so we prevent those cards from wrapping.
   */

  const i18nService = I18nService.instance as I18nService;
  const locale = i18nService.state.locale;
  const excludedLanguages = ['en', 'ko', 'zh']; // add i18n prefixes here to exclude languages from wrapping
  const excludeWrap = excludedLanguages.includes(locale.split('-')[0]);

  const { availableAppSources } = useSourceShowcaseSettings();

  const primaryPlatformService = UserService.state.auth
    ? getPlatformService(UserService.state.auth.primaryPlatform)
    : null;

  const iterableWidgetTypes = useMemo(
    () =>
      Object.keys(WidgetType)
        .filter((type: string) => isNaN(Number(type)) && type !== 'SubscriberGoal')
        .filter((type: string) => {
          const widgetPlatforms = WidgetDisplayData(primaryPlatform)[WidgetType[type]]?.platforms;
          if (!widgetPlatforms) return true;
          return linkedPlatforms?.some(
            platform => widgetPlatforms && widgetPlatforms.has(platform),
          );
        })
        .filter(type => {
          // show only supported widgets
          const whitelist = primaryPlatformService?.widgetsWhitelist;
          if (!whitelist) return true;
          return whitelist.includes(WidgetType[type]);
        }),
    [],
  );

  const availableSources = useMemo(() => {
    const guestCamAvailable =
      (IncrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.guestCamBeta) ||
        IncrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.guestCamProduction)) &&
      UserService.views.isLoggedIn;

    return SourcesService.getAvailableSourcesTypesList().filter(type => {
      // Freetype on windows is hidden
      if (type.value === 'text_ft2_source' && byOS({ [OS.Windows]: true, [OS.Mac]: false })) {
        return;
      }

      if (type.value === 'mediasoupconnector' && !guestCamAvailable) {
        return false;
      }

      return !(type.value === 'scene' && ScenesService.views.scenes.length <= 1);
    });
  }, []);

  const essentialSourcesOrder = ['game_capture', 'dshow_input', 'ffmpeg_source'];
  // Stream Label is last, we don't have a widget type for it
  const essentialWidgetsOrder = [
    WidgetType.AlertBox,
    WidgetType.ChatBox,
    WidgetType.EventList,
    WidgetType.ViewerCount,
  ];

  function customOrder<T, U>(orderArray: T[], getter: (a: U) => T) {
    return (s1: U, s2: U): number =>
      orderArray.indexOf(getter(s1)) - orderArray.indexOf(getter(s2));
  }

  const essentialSources = useMemo(() => {
    const essentialDefaults = availableSources
      .filter(source =>
        [
          'dshow_input',
          'ffmpeg_source',
          'game_capture',
          //byOS({ [OS.Windows]: 'screen_capture', [OS.Mac]: 'window_capture' }),
        ].includes(source.value),
      )
      .sort(customOrder(essentialSourcesOrder, s => s.value));

    const essentialWidgets = iterableWidgetTypes.filter(type =>
      [WidgetType.AlertBox, WidgetType.ChatBox].includes(WidgetType[type]),
    );
    return { essentialDefaults, essentialWidgets };
  }, []);

  function showContent(key: string) {
    const correctKey = key === p.activeTab;
    if (key === 'apps') {
      return correctKey && availableAppSources.length > 0;
    }
    return correctKey;
  }

  function handleAuth() {
    WindowsService.closeChildWindow();
    UserService.showLogin();
  }

  function filterEssential(source: IObsListOption<TSourceType> | string) {
    if (p.activeTab !== 'all') return true;
    if (typeof source === 'string') {
      return !essentialSources.essentialWidgets.find(s => s === source);
    }
    return !essentialSources.essentialDefaults.find(s => s.value === source.value);
  }

  const { Panel } = Collapse;

  const toSourceEl = (source: IObsListOption<TSourceType>) => (
    <SourceTag key={source.value} type={source.value} essential excludeWrap={excludeWrap} />
  );

  // TODO: restrict type
  // Hide widget descriptions on non-general tab
  const toWidgetEl = (widget: string) => (
    <SourceTag key={widget} type={widget} excludeWrap={excludeWrap} hideShortDescription />
  );

  const essentialSourcesList = useMemo(
    () => (
      <>
        {essentialSources.essentialDefaults.map(source => (
          <SourceTag key={source.value} type={source.value} essential excludeWrap={excludeWrap} />
        ))}

        {isLoggedIn &&
          essentialSources.essentialWidgets.map(widgetType => (
            <SourceTag key={widgetType} type={widgetType} essential excludeWrap={excludeWrap} />
          ))}
        {isLoggedIn && (
          <SourceTag
            key="streamlabel"
            name={$t('Stream Label')}
            type="streamlabel"
            essential
            excludeWrap={excludeWrap}
          />
        )}
      </>
    ),
    [essentialSources, isLoggedIn, excludeWrap],
  );

  const sourceDisplayData = useMemo(() => SourceDisplayData(), []);
  const widgetDisplayData = useMemo(() => WidgetDisplayData(), []);

  const byGroup = (group: 'capture' | 'av' | 'media') => (source: IObsListOption<TSourceType>) => {
    const displayData = sourceDisplayData[source.value];
    if (!displayData) {
      return true;
    }

    return displayData.group === group;
  };

  const byWidgetGroup = (group: string) => (widget: string) => {
    const displayData = widgetDisplayData[WidgetType[widget]];
    if (!displayData) {
      return true;
    }

    return displayData.group === group;
  };

  const captureSourcesList = useMemo(
    () => availableSources.filter(byGroup('capture')).map(toSourceEl),
    [availableSources, excludeWrap],
  );

  const avSourcesList = useMemo(() => availableSources.filter(byGroup('av')).map(toSourceEl), [
    availableSources,
    excludeWrap,
  ]);

  const mediaSourcesList = useMemo(
    () => (
      <>
        {availableSources.filter(byGroup('media')).map(toSourceEl)}
        <SourceTag
          key="replay"
          name={$t('Instant Replay')}
          type="replay"
          excludeWrap={excludeWrap}
        />
        {designerMode && (
          <SourceTag
            key="icon_library"
            name={$t('Custom Icon')}
            type={'icon_library'}
            excludeWrap={excludeWrap}
          />
        )}
      </>
    ),
    [availableSources, excludeWrap, designerMode],
  );

  const widgetList = useMemo(
    () => (
      <>
        {!isLoggedIn ? (
          <Empty
            description={$t('You must be logged in to use Widgets')}
            image={$i(`images/sleeping-kevin-${demoMode}.png`)}
          >
            <Button onClick={handleAuth}>{$t('Click here to log in')}</Button>
          </Empty>
        ) : (
          <>
            {iterableWidgetTypes.filter(filterEssential).map(widgetType => (
              <SourceTag
                key={widgetType}
                type={widgetType}
                excludeWrap={excludeWrap}
                hideShortDescription
              />
            ))}
            {p.activeTab !== 'all' && (
              <SourceTag
                key="streamlabel"
                name={$t('Stream Label')}
                type="streamlabel"
                excludeWrap={excludeWrap}
              />
            )}
          </>
        )}
      </>
    ),
    [isLoggedIn, iterableWidgetTypes, p.activeTab, excludeWrap],
  );

  const widgetGroupedList = useMemo(() => {
    // TODO: restrict types
    const widgetsInGroup = (group: string, sorter?: (s1: string, s2: string) => number) => {
      const widgets = iterableWidgetTypes
        .filter(byWidgetGroup(group))
        // Sort lexographically by default, if sorter is not provided
        .sort(sorter);

      return widgets.map(toWidgetEl);
    };

    // Using essentials as a group for widgets since we wanna display more
    const essentialWidgets = (
      <>
        {widgetsInGroup(
          'essential',
          customOrder(essentialWidgetsOrder, x => WidgetType[x]),
        )}
        <SourceTag
          key="streamlabel"
          name={$t('Stream Label')}
          type="streamlabel"
          excludeWrap={excludeWrap}
          hideShortDescription
        />
      </>
    );

    const interactiveWidgets = widgetsInGroup('interactive');
    const goalWidgets = widgetsInGroup('goals');
    const flairWidgets = <>{widgetsInGroup('flair')}</>;
    const charityWidgets = widgetsInGroup('charity');

    return (
      <>
        {!isLoggedIn ? (
          <Empty
            description={$t('You must be logged in to use Widgets')}
            image={$i(`images/sleeping-kevin-${demoMode}.png`)}
          >
            <Button onClick={handleAuth}>{$t('Click here to log in')}</Button>
          </Empty>
        ) : (
          <Collapse
            ghost
            activeKey={widgetSections}
            onChange={xs => setWidgetExpandedSections(xs as string[])}
          >
            <Panel header={$t('Essentials')} key="essentialWidgets">
              <div className="collapse-section" data-testid="essential-widgets">
                {essentialWidgets}
              </div>
            </Panel>
            <Panel header={$t('Interactive')} key="interactive">
              <div className="collapse-section" data-testid="interactive-widgets">
                {interactiveWidgets}
              </div>
            </Panel>
            <Panel header={$t('Goals')} key="goals">
              <div className="collapse-section" data-testid="goal-widgets">
                {goalWidgets}
              </div>
            </Panel>
            <Panel header={$t('Flair')} key="flair">
              <div className="collapse-section" data-testid="flair-widgets">
                {flairWidgets}
              </div>
            </Panel>
            {/* TODO: we don't have any charity widgets on Desktop
            <Panel header={$t('Charity')} key="charity">
              <div className="collapse-section" data-testid="charity-widgets">
                {charityWidgets}
              </div>
            </Panel>
            */}
          </Collapse>
        )}
      </>
    );
  }, [widgetSections, isLoggedIn, iterableWidgetTypes, excludeWrap]);

  const appsList = useMemo(
    () => (
      <>
        {availableAppSources.map(app => (
          <SourceTag
            key={`${app.appId}${app.source.id}`}
            name={app.source.name}
            type="app_source"
            appId={app.appId}
            appSourceId={app.source.id}
            excludeWrap={excludeWrap}
          />
        ))}
      </>
    ),
    [availableAppSources, excludeWrap],
  );

  const groupedSources = useMemo(
    () => (
      <>
        <Panel header={$t('Capture Sources')} key="captureSources">
          <div className="collapse-section">{captureSourcesList}</div>
        </Panel>
        <Panel header={$t('Video and Audio')} key="avSources">
          <div className="collapse-section">{avSourcesList}</div>
        </Panel>
        <Panel header={$t('Media')} key="mediaSources">
          <div className="collapse-section">{mediaSourcesList}</div>
        </Panel>
      </>
    ),
    [captureSourcesList, avSourcesList, mediaSourcesList],
  );

  const individualTab = useMemo(() => {
    /*
     * TODO: general is called media now, should probably rename in code.
     * It is the same as the All Sources tab except for widgets and apps.
     */
    if (showContent('general')) {
      return (
        <>
          <Col span={24}>
            <Collapse
              ghost
              activeKey={expandedSections}
              onChange={xs => setExpandedSections(xs as string[])}
            >
              {groupedSources}
            </Collapse>
          </Col>
        </>
      );
    } else if (showContent('widgets')) {
      return (
        <>
          <Col span={24}>{widgetGroupedList}</Col>
        </>
      );
    } else if (showContent('apps')) {
      return (
        <>
          <Col span={24}>
            <PageHeader style={{ paddingLeft: 0 }} title={$t('Apps')} />
          </Col>
          {appsList}
        </>
      );
    }
  }, [p.activeTab, availableAppSources, appsList, widgetList]);

  return (
    <Scrollable style={{ height: 'calc(100% - 64px)' }} className={styles.sourceGrid}>
      <Row gutter={[8, 8]} style={{ marginLeft: '8px', marginRight: '8px', paddingBottom: '24px' }}>
        {p.activeTab === 'all' ? (
          <>
            <Col span={24}>
              <Collapse
                ghost
                activeKey={expandedSections}
                onChange={xs => setExpandedSections(xs as string[])}
              >
                <Panel header={$t('Essentials')} key="essentialSources">
                  <div className="collapse-section" data-testid="essential-sources">
                    {essentialSourcesList}
                  </div>
                </Panel>
                {groupedSources}
                <Panel header={$t('Widgets')} key="widgets">
                  <div className="collapse-section" data-testid="widget-sources">
                    {widgetList}
                  </div>
                </Panel>
                <Panel header={$t('Apps')} key="apps">
                  <div className="collapse-section" data-testid="app-sources">
                    {appsList}
                  </div>
                </Panel>
              </Collapse>
            </Col>
          </>
        ) : (
          individualTab
        )}
      </Row>
    </Scrollable>
  );
}
