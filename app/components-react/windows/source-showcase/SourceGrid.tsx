import React, { useMemo, useState } from 'react';
import { InputNumber, Form, Empty, Row, Col, PageHeader, Button, Collapse } from 'antd';
import Fuse from 'fuse.js';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { IObsListOption } from 'components/obs/inputs/ObsInput';
import { IWidgetDisplayData, WidgetDisplayData, WidgetType } from 'services/widgets';
import { TSourceType, SourceDisplayData, ISourceDisplayData } from 'services/sources';
import { getPlatformService } from 'services/platforms';
import { $i } from 'services/utils';
import { byOS, OS } from 'util/operating-systems';
import { $t, I18nService } from 'services/i18n';
import SourceTag from './SourceTag';
import { useSourceShowcaseSettings } from './useSourceShowcase';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { useRealmObject } from 'components-react/hooks/realm';
import styles from './SourceGrid.m.less';

export default function SourceGrid(p: { activeTab: string; searchTerm: string }) {
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

  const iterableWidgetTypesBase = useMemo(() => {
    // TODO: this can be combined and the conditions improved to make it more performant and readable
    const filtered = Object.keys(WidgetType)
      .filter((type: string) => isNaN(Number(type)) && type !== 'SubscriberGoal')
      .filter((type: string) => {
        // TODO: index
        // @ts-ignore
        const widgetPlatforms = WidgetDisplayData(primaryPlatform)[WidgetType[type]]?.platforms;
        if (!widgetPlatforms) return true;
        return linkedPlatforms?.some(platform => widgetPlatforms && widgetPlatforms.has(platform));
      })
      .filter(type => {
        // show only supported widgets
        const whitelist = primaryPlatformService?.widgetsWhitelist;
        if (!whitelist) return true;
        // TODO: index
        // @ts-ignore
        return whitelist.includes(WidgetType[type]);
      });

    // Add Stream Label here as opposed to the DOM as before, still not perfect
    if (isLoggedIn) {
      filtered.push('streamlabel');
    }

    return filtered;
  }, [isLoggedIn]);

  const { platform } = useVuex(() => ({ platform: UserService.views.platform?.type }));
  const [searchThreshold, _setSearchThreshold] = useState(0.3);
  const toFuseCollection = (xs: string[], threshold: number = 0.3) => {
    const list = xs.reduce((acc, type) => {
      const displayData: IWidgetDisplayData | ISourceDisplayData =
        // TODO: index
        // @ts-ignore
        WidgetDisplayData(platform)[WidgetType[type]] || SourceDisplayData()[type];

      if (!displayData) {
        return acc;
      }

      return [
        ...acc,
        {
          type,
          name: displayData.name,
          description: displayData.description,
          shortDesc: displayData.shortDesc,
        },
      ];
    }, []);

    const result = new Fuse(list, {
      threshold,
      keys: [
        { name: 'type', weight: 1 },
        { name: 'name', weight: 0.8 },
        { name: 'shortDesc', weight: 0.5 },
        { name: 'description', weight: 0.2 },
      ],
    });

    return result;
  };

  const isSourceType = (x: any): x is IObsListOption<TSourceType> => {
    return x && typeof x === 'object' && 'value' in x;
  };

  const isSourceTypeList = (xs: any[]): xs is IObsListOption<TSourceType>[] => {
    return isSourceType(xs[0]);
  };

  type FuseItem = {
    type: string;
    name: string;
    description: string;
    shortDesc: string;
  };

  const useSearchMemo = <T extends string[] | IObsListOption<TSourceType>[]>(
    xs: T,
    options: { threshold?: number } = {},
    deps: React.DependencyList = [],
  ) =>
    useMemo(() => {
      const coll = (() => {
        if (!xs.length) {
          return [];
        }

        if (isSourceTypeList(xs)) {
          return xs.map(x => x.value);
        } else {
          return xs as string[];
        }
      })();

      const list = toFuseCollection(coll, options.threshold);
      const toOrigElement = (x: FuseItem) => {
        // TODO: do this check once, TS is not happy
        if (isSourceTypeList(xs)) {
          return {
            description: x.description,
            value: x.type,
          } as IObsListOption<TSourceType>;
        } else {
          return x.type;
        }
      };

      const result = p.searchTerm ? list.search(p.searchTerm).map(toOrigElement) : xs;
      return result as T;
    }, [xs, platform, p.searchTerm, ...(options.threshold ? [options.threshold] : []), ...deps]);

  const iterableWidgetTypes = useSearchMemo(iterableWidgetTypesBase, {
    threshold: searchThreshold,
  });

  const availableSourcesBase = useMemo(() => {
    const guestCamAvailable =
      (IncrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.guestCamBeta) ||
        IncrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.guestCamProduction)) &&
      UserService.views.isLoggedIn;

    const result = SourcesService.getAvailableSourcesTypesList().filter(type => {
      // Freetype on windows is hidden
      if (type.value === 'text_ft2_source' && byOS({ [OS.Windows]: true, [OS.Mac]: false })) {
        return;
      }

      if (type.value === 'mediasoupconnector' && !guestCamAvailable) {
        return false;
      }

      return !(type.value === 'scene' && ScenesService.views.scenes.length <= 1);
    });

    // TODO: why aren't these on getAvailableSourcesTypesList?
    // FIMXE: get out of our way TS, do not want to add them to TSourceType just yet
    return ([
      ...result,
      {
        description: 'Instant Replay',
        value: 'replay',
      },
      ...(designerMode
        ? [
            {
              value: 'icon_library',
              description: 'Custom Icon',
            },
          ]
        : []),
    ] as any) as IObsListOption<TSourceType>[];
  }, []);

  const availableSources = useSearchMemo(availableSourcesBase);

  const essentialSourcesOrder = ['game_capture', 'dshow_input', 'ffmpeg_source'];
  // Stream Label is last, we don't have a widget type for it
  const essentialWidgetsOrder = [
    WidgetType.AlertBox,
    WidgetType.ChatBox,
    WidgetType.EventList,
    WidgetType.ViewerCount,
    'streamlabel',
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
      [WidgetType.AlertBox, WidgetType.ChatBox, 'streamlabel'].includes(
        // TODO: index
        // @ts-ignore
        type === 'streamlabel' ? type : WidgetType[type],
      ),
    );

    return { essentialDefaults, essentialWidgets };
  }, [availableSources, iterableWidgetTypes, isLoggedIn]);

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

  const toSourceEl = (source: IObsListOption<TSourceType>) => (
    <SourceTag key={source.value} type={source.value} essential excludeWrap={excludeWrap} />
  );

  // TODO: restrict type
  const toWidgetEl = (widget: string, { essential = false, hideShortDescription = false } = {}) =>
    widget === 'streamlabel' ? (
      <SourceTag
        key="streamlabel"
        name={$t('Stream Label')}
        type="streamlabel"
        essential
        /* Show short description if part of the Essentials group in All Sources tab */
        hideShortDescription={p.activeTab !== 'all'}
        excludeWrap={excludeWrap}
      />
    ) : (
      <SourceTag
        key={widget}
        type={widget}
        excludeWrap={excludeWrap}
        essential={essential}
        hideShortDescription={hideShortDescription}
      />
    );

  const essentialSourcesList = useMemo(() => {
    if (essentialSources.essentialDefaults.length || essentialSources.essentialWidgets.length) {
      return (
        <>
          {essentialSources.essentialDefaults.map(source => (
            <SourceTag key={source.value} type={source.value} essential excludeWrap={excludeWrap} />
          ))}

          {isLoggedIn &&
            essentialSources.essentialWidgets.map(widgetType =>
              toWidgetEl(widgetType, { essential: true }),
            )}
        </>
      );
    }
  }, [essentialSources, isLoggedIn, excludeWrap, iterableWidgetTypes]);

  const sourceDisplayData = useMemo(() => SourceDisplayData(), []);
  const widgetDisplayData = useMemo(() => WidgetDisplayData(), []);

  const byGroup = (group: 'capture' | 'av' | 'media') => (source: IObsListOption<TSourceType>) => {
    const displayData = sourceDisplayData[(source as IObsListOption<TSourceType>).value];

    return displayData?.group === group;
  };

  const byWidgetGroup = (group: string) => (widget: string) => {
    // TODO: index
    // @ts-ignore
    const displayData = widgetDisplayData[WidgetType[widget]];

    if (widget === 'streamlabel' && group === 'essential') {
      return true;
    }

    return displayData?.group === group;
  };

  // eslint-disable-next-line comma-spacing
  const mapToSourceElIfSourceGiven = <T,>(xs: Array<T>): JSX.Element[] | T[] => {
    if (isSourceTypeList(xs)) {
      return xs.map(toSourceEl);
    }

    return xs;
  };

  // TODO: use concrete types if we never want to use this outside the `*List`'s below
  const useNonEmptySourceElements = <T, K extends Array<T>>(
    factory: () => K,
    deps: React.DependencyList,
    mapper: (factoryResult: K) => JSX.Element[] | T[] = mapToSourceElIfSourceGiven,
  ) => {
    return useMemo(() => {
      const result = factory();
      if (result.length) {
        return mapper(result);
      }
    }, deps);
  };
  const mapToWidgetEl = (type: string) => toWidgetEl(type, { hideShortDescription: true });
  const useNonEmptyWidgetElements = (
    factory: () => string[],
    deps: React.DependencyList = [iterableWidgetTypes],
  ) => {
    return useNonEmptySourceElements(factory, deps, widgets => widgets.map(mapToWidgetEl));
  };

  const captureSourcesList = useNonEmptySourceElements(
    () => availableSources.filter(byGroup('capture')),
    [availableSources, excludeWrap],
  );

  const avSourcesList = useNonEmptySourceElements(() => availableSources.filter(byGroup('av')), [
    availableSources,
    excludeWrap,
  ]);

  const mediaSourcesList = useNonEmptySourceElements(
    () => availableSources.filter(byGroup('media')),
    [availableSources, excludeWrap, designerMode],
  );

  // TODO: we made useNonEmptySourceElements generic for a reason, but this has way too much logic?
  const widgetList = useMemo(() => {
    const widgets = iterableWidgetTypes.filter(filterEssential);

    // If we're not logged in we still want to display the message below
    if (isLoggedIn && !widgets.length) {
      return;
    }

    const list = widgets.map(widgetType => toWidgetEl(widgetType, { hideShortDescription: true }));

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
          list
        )}
      </>
    );
  }, [isLoggedIn, iterableWidgetTypes, p.activeTab, excludeWrap]);

  // TODO: restrict types
  const widgetsInGroup = (group: string, sorter?: (s1: string, s2: string) => number) => {
    return (
      iterableWidgetTypes
        .filter(byWidgetGroup(group))
        // Sort lexographically by default, if sorter is not provided
        .sort(sorter)
    );
  };

  // Using essentials as a group for widgets since we wanna display more
  // HACK: streamlabel doesn't have a widget type, and we want it at the end
  const essentialWidgets = useNonEmptyWidgetElements(() =>
    widgetsInGroup(
      'essential',
      customOrder(essentialWidgetsOrder, x =>
        // TODO: index
        // @ts-ignore
        x === 'streamlabel' ? 'streamlabel' : WidgetType[x],
      ),
    ),
  );

  const interactiveWidgets = useNonEmptyWidgetElements(() => widgetsInGroup('interactive'));
  const goalWidgets = useNonEmptyWidgetElements(() => widgetsInGroup('goals'));
  const flairWidgets = useNonEmptyWidgetElements(() => widgetsInGroup('flair'));
  const charityWidgets = useNonEmptyWidgetElements(() => widgetsInGroup('charity'));

  console.log('SOURCE GRID goalWidgets', goalWidgets);

  const widgetGroupedList = useMemo(() => {
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
            {nonEmptyPanel({
              id: 'essentialWidgets',
              src: essentialWidgets,
              header: $t('Essentials'),
              testId: 'essential-widgets',
            })}

            {nonEmptyPanel({
              id: 'interactive',
              src: interactiveWidgets,
              header: $t('Interactive'),
              testId: 'interactive-widgets',
            })}

            {nonEmptyPanel({
              id: 'goals',
              src: goalWidgets,
              header: $t('Goals'),
              testId: 'goal-widgets',
            })}

            {nonEmptyPanel({
              id: 'flair',
              src: flairWidgets,
              header: $t('Flair'),
              testId: 'flair-widgets',
            })}

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
  }, [
    widgetSections,
    isLoggedIn,
    essentialWidgets,
    interactiveWidgets,
    goalWidgets,
    flairWidgets,
    excludeWrap,
  ]);

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
        {nonEmptyPanel({
          id: 'captureSources',
          src: captureSourcesList,
          header: $t('Capture Sources'),
          testId: 'capture-sources',
        })}

        {nonEmptyPanel({
          id: 'avSources',
          src: avSourcesList,
          header: $t('Video and Audio'),
          testId: 'av-sources',
        })}

        {nonEmptyPanel({
          id: 'mediaSources',
          src: mediaSourcesList,
          header: $t('Media'),
          testId: 'media-sources',
        })}
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
                {nonEmptyPanel({
                  id: 'essentialSources',
                  src: essentialSourcesList,
                  header: $t('Essentials'),
                  testId: 'essential-sources',
                })}

                {groupedSources}

                {nonEmptyPanel({
                  id: 'widgets',
                  src: widgetList,
                  header: $t('Widgets'),
                  testId: 'widget-sources',
                })}

                {/* No searching for apps needed */}
                {!p.searchTerm &&
                  nonEmptyPanel({
                    id: 'apps',
                    src: appsList,
                    header: $t('Apps'),
                    testId: 'app-sources',
                  })}
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

const { Panel } = Collapse;
// Why we can't use a component beats me, thanks antd (it would render empty).
const nonEmptyPanel = ({
  src,
  id,
  header,
  testId,
}: {
  src: null | undefined | unknown[] | JSX.Element;
  id: string;
  header: string;
  testId: string;
}) => {
  if (!src) {
    return null;
  }

  return (
    <Panel header={header} key={id}>
      <div className="collapse-section" data-testid={testId}>
        {src}
      </div>
    </Panel>
  );
};
